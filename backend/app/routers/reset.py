"""routers/reset.py — port do fluxo de reset de senha (Setup.gs).

MailApp → SMTP configurável; sem SMTP configurado, o link é registrado
no log do container (útil para dev/homolog).
"""
import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import config, security
from ..deps import (
    ErroNegocio,
    buscar_usuario,
    exigir,
    exigir_email_institucional,
    is_valido,
)
from ..models import ResetSenha, Usuario

log = logging.getLogger("projeto-compras")


def _resposta_padrao():
    return {"ok": True, "data": {
        "mensagem": "Se existir uma conta com este e-mail, enviaremos as "
                    "instruções de redefinição.",
    }}


def api_solicitar_reset_senha(db: Session, payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    exigir_email_institucional(email)

    # limpeza de tokens expirados/usados
    db.execute(delete(ResetSenha).where(
        (ResetSenha.expira_em <= security.agora()) | (ResetSenha.usado == True)
    ))
    db.commit()

    u = buscar_usuario(db, email)
    if not u or not is_valido(u):
        return _resposta_padrao()

    # invalida tokens anteriores deste e-mail
    db.execute(delete(ResetSenha).where(ResetSenha.email == email))

    token = security.novo_token_reset()
    db.add(ResetSenha(token=token, email=email,
                      expira_em=security.expiracao_reset(),
                      usado=False, criado_em=security.agora()))
    db.commit()

    base = str(payload.get("base_url") or "").split("#")[0]
    link = (base + "#/redefinir/" + token) if base else token

    nome = u.nome_completo or email
    assunto = "Projeto Compras — redefinição de senha"
    corpo = (
        f"Olá, {nome}!\n\n"
        "Recebemos um pedido de redefinição de senha da sua conta no Projeto Compras.\n\n"
        + (f"Abra o link abaixo para definir uma nova senha:\n{link}\n\n"
           if base else
           f"Use este código para redefinir sua senha: {token}\n\n")
        + f"O link/código é válido por {config.RESET_VALIDADE_MIN} minutos.\n"
        "Se você não solicitou, ignore este e-mail.\n\n"
        "Sistema FIEMS — Projeto Compras"
    )

    if config.SMTP_HOST:
        try:
            _enviar_email(email, assunto, corpo)
        except Exception as e:
            log.warning("Falha ao enviar e-mail de reset: %s", e)
    else:
        log.info("SMTP não configurado — link de reset para %s: %s", email, link)

    return _resposta_padrao()


def api_redefinir_senha(db: Session, payload: dict):
    token = str(payload.get("token") or "").strip()
    senha = str(payload.get("senha") or "")
    senha2 = str(payload.get("senha2") or "")

    exigir(token, "Token ausente. Solicite uma nova redefinição.")
    exigir(len(senha) >= 6, "A senha deve ter ao menos 6 caracteres.")
    exigir(not senha2 or senha == senha2, "As senhas não coincidem.")

    r = db.get(ResetSenha, token)
    exigir(r, "Link de redefinição inválido. Solicite uma nova redefinição.")
    exigir(not r.usado, "Este link de redefinição já foi utilizado.")
    exigir(r.expira_em > security.agora(),
           "Este link de redefinição expirou. Solicite outro.")

    email = str(r.email).lower()
    alvo = buscar_usuario(db, email)
    exigir(alvo, "Usuário não encontrado.")

    alvo.salt = ""
    alvo.senha_hash = security.hash_bcrypt(senha)
    r.usado = True
    db.commit()
    return {"ok": True, "data": {"email": email,
            "mensagem": "Senha redefinida com sucesso. Faça login."}}


def _enviar_email(destino: str, assunto: str, corpo: str) -> None:
    msg = EmailMessage()
    msg["From"] = config.SMTP_DE
    msg["To"] = destino
    msg["Subject"] = assunto
    msg.set_content(corpo)

    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30) as srv:
        if config.SMTP_TLS:
            srv.starttls()
        if config.SMTP_USUARIO:
            srv.login(config.SMTP_USUARIO, config.SMTP_SENHA)
        srv.send_message(msg)
