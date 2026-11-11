"""security.py — senhas e tokens.

Substitui SHA-256(salt+senha) do Apps Script por bcrypt. Contas legadas
(importadas da planilha) continuam autenticando pelo hash antigo e são
re-hasheadas com bcrypt no primeiro login bem-sucedido.
"""
import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt

from . import config


def hash_bcrypt(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def hash_legado(senha: str, salt: str) -> str:
    """Mesmo cálculo do Utils.gs: base64(SHA-256(salt + senha))."""
    digest = hashlib.sha256((str(salt) + str(senha)).encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def verificar_senha(senha: str, senha_hash: str, salt: str) -> bool:
    if not senha_hash:
        return False
    if senha_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(senha.encode("utf-8"), senha_hash.encode("ascii"))
        except ValueError:
            return False
    return hash_legado(senha, salt) == senha_hash


def hash_eh_bcrypt(senha_hash: str) -> bool:
    return bool(senha_hash) and senha_hash.startswith("$2")


def novo_salt() -> str:
    return secrets.token_hex(16)


def novo_token() -> str:
    return str(uuid.uuid4())


def novo_token_reset() -> str:
    return uuid.uuid4().hex


def expiracao_sessao() -> datetime:
    return agora() + timedelta(minutes=config.SESSAO_MINUTOS)


def expiracao_reset() -> datetime:
    return agora() + timedelta(minutes=config.RESET_VALIDADE_MIN)


def agora() -> datetime:
    """Agora em UTC *naive* (convenção do banco: SQLite grava datetimes naive)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(d: datetime | None) -> str:
    """Serializa como o client espera (new Date(...) entende ambos formatos)."""
    if not d:
        return ""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
