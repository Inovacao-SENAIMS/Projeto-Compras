"""routers/auth.py — port de Auth.gs (login/cadastro/logout)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .. import config, security
from ..deps import (
    ErroNegocio,
    buscar_usuario,
    eh_admin,
    exigir,
    exigir_email_institucional,
    is_valido,
    limpar_sessoes_expiradas,
    nome_exibicao,
)
from ..models import Sessao, Usuario

GRUPOS = {"SOLICITANTE": "UserISI_IST", "TIME": "Time_Compras",
          "MANAGER": "Manager_Compras", "SUPER": "SuperUsuario"}


def api_login(db: Session, payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    senha = str(payload.get("senha") or "")
    exigir(email and senha, "Informe e-mail e senha.")

    limpar_sessoes_expiradas(db)

    u = buscar_usuario(db, email)
    if not u:
        return {"ok": False, "erro": "Credenciais inválidas."}
    if not is_valido(u):
        return {"ok": False, "erro": "Usuário inativo. Fale com a Gestão."}

    if not security.verificar_senha(senha, u.senha_hash, u.salt):
        return {"ok": False, "erro": "Credenciais inválidas."}

    # Upgrade transparente: hash legado (SHA-256) → bcrypt
    if not security.hash_eh_bcrypt(u.senha_hash):
        u.salt = ""
        u.senha_hash = security.hash_bcrypt(senha)
        db.commit()

    token = security.novo_token()
    db.add(Sessao(token=token, email=email, expira_em=security.expiracao_sessao()))
    db.commit()

    troca_obrigatoria = eh_admin(email) and security.verificar_senha(
        config.ADMIN_SENHA_PADRAO, u.senha_hash, u.salt
    )
    return {
        "ok": True,
        "data": {
            "token": token,
            "email": email,
            "nome": nome_exibicao(db, email, u.nome_completo),
            "grupo": str(u.grupo),
            "expira_em": int(datetime.now(timezone.utc).timestamp() * 1000) + config.SESSAO_MINUTOS * 60 * 1000,
            "troca_senha_obrigatoria": bool(troca_obrigatoria),
        },
    }


def api_logout(db: Session, usuario: Usuario, payload: dict):
    token = str(payload.get("_token") or "")
    s = db.get(Sessao, token)
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True, "data": None}


def api_cadastrar_usuario(db: Session, payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    nome = str(payload.get("nome_completo") or "").strip()
    senha = str(payload.get("senha") or "")
    senha2 = str(payload.get("senha2") or "")

    exigir_email_institucional(email)
    exigir(nome, "Informe o nome completo.")
    exigir(len(senha) >= 6, "A senha deve ter ao menos 6 caracteres.")
    exigir(not senha2 or senha == senha2, "As senhas não coincidem.")
    exigir(not buscar_usuario(db, email), "Já existe uma conta para este e-mail.")

    # Auto-registro entra sempre como solicitante (igual ao Django).
    db.add(Usuario(
        nome_completo=nome,
        email=email,
        grupo=GRUPOS["SOLICITANTE"],
        senha_hash=security.hash_bcrypt(senha),
        area_atuacao=str(payload.get("area_atuacao") or ""),
        cargo=str(payload.get("cargo") or ""),
        instituto=str(payload.get("instituto") or ""),
        telefone=str(payload.get("telefone") or ""),
        ramal=str(payload.get("ramal") or ""),
        ativo=True,
    ))
    db.commit()
    return {"ok": True, "data": {"email": email}}
