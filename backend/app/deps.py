"""deps.py — sessão, permissões e erros de negócio.

Substitui o roteamento com token do Code.gs + helpers do Utils.gs.
Erros de regra são ErroNegocio → envelope {ok:false, erro:mensagem},
igual ao comportamento do Apps Script (o client já trata esse formato).
"""
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import config, security
from .models import Sessao, Usuario


class ErroNegocio(Exception):
    """Regra violada — a mensagem vai no envelope {ok:false, erro}."""

    def __init__(self, mensagem: str):
        super().__init__(mensagem)
        self.mensagem = mensagem


def exigir(cond, mensagem: str) -> None:
    if not cond:
        raise ErroNegocio(mensagem)


# ------------------------------- sessões --------------------------------

def limpar_sessoes_expiradas(db: Session) -> None:
    try:
        db.execute(
            delete(Sessao).where(Sessao.expira_em <= security.agora())
        )
        db.commit()
    except Exception:
        db.rollback()


def validar_sessao(db: Session, token: str | None) -> Usuario | None:
    """Substitui validarSessao() do Utils.gs."""
    if not token:
        return None
    token = str(token).strip()
    if not token:
        return None
    sessao = db.get(Sessao, token)
    if not sessao or sessao.expira_em <= security.agora():
        return None
    u = buscar_usuario(db, sessao.email)
    if not u or not is_valido(u):
        return None
    return u


def usuario_autenticado(db: Session, token: str | None) -> Usuario:
    u = validar_sessao(db, token)
    if not u:
        raise ErroNegocio("Sessão expirada. Faça login novamente.")
    return u


# ------------------------------- usuários -------------------------------

GRUPOS = {
    "SOLICITANTE": "UserISI_IST",
    "TIME": "Time_Compras",
    "MANAGER": "Manager_Compras",
    "SUPER": "SuperUsuario",
}

STATUS = {
    "ABERTA": "aberta",
    "ENVIADA": "enviada",
    "EM_ANALISE": "em_analise",
    "CONCLUIDA": "concluida",
    "CANCELADA": "cancelada",
}

STATUS_TERMINAIS = [STATUS["CONCLUIDA"], STATUS["CANCELADA"]]

TRANSICOES = {
    "aberta": [],
    "enviada": [],
    "em_analise": ["concluida", "cancelada"],
    "concluida": [],
    "cancelada": [],
}


def buscar_usuario(db: Session, email: str) -> Usuario | None:
    em = str(email or "").strip().lower()
    if not em:
        return None
    return db.scalar(select(Usuario).where(Usuario.email == em))


def eh_admin(email: str) -> bool:
    return str(email or "").strip().lower() == config.ADMIN_EMAIL


def is_super(u: Usuario) -> bool:
    """A conta ADMIN do sistema tem acesso full e é tratada como SuperUsuário."""
    if not u:
        return False
    return u.grupo == GRUPOS["SUPER"] or eh_admin(u.email)


def is_manager(u: Usuario) -> bool:
    return u.grupo == GRUPOS["MANAGER"] or is_super(u)


def is_equipe(u: Usuario) -> bool:
    return u.grupo == GRUPOS["TIME"] or is_manager(u)


def is_valido(u: Usuario) -> bool:
    return bool(u and u.ativo)


def exigir_nao_admin(email: str, acao: str) -> None:
    exigir(
        not eh_admin(email),
        f"A conta administrativa do sistema ({config.ADMIN_EMAIL}) não pode ser {acao}.",
    )


def nome_exibicao(db: Session, email: str, nome_completo: str = "") -> str:
    """Igual ao Django: nome completo → primeiro nome → email sem domínio."""
    if nome_completo:
        return nome_completo
    u = buscar_usuario(db, email)
    if u and u.nome_completo:
        return u.nome_completo
    return str(email or "").split("@")[0]


def exigir_email_institucional(email: str) -> None:
    import re

    padrao = rf"^[^@\s]+@{re.escape(config.DOMINIO_EMAIL)}$"
    exigir(
        bool(re.match(padrao, str(email or "").strip(), re.IGNORECASE)),
        f"Só é aceito e-mail institucional @{config.DOMINIO_EMAIL}.",
    )
