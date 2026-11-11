"""seed.py — criação idempotente da conta administrativa (≈ criarGestorInicial)."""
import logging

from sqlalchemy.orm import Session

from . import config, security
from .models import Usuario

log = logging.getLogger("projeto-compras")


def garantir_admin(db: Session) -> bool:
    """Garante que a conta ADMIN existe. True se criada agora."""
    existente = db.query(Usuario).filter(
        Usuario.email == config.ADMIN_EMAIL.lower()).first()
    if existente:
        return False
    db.add(Usuario(
        nome_completo="Administrador do Sistema",
        email=config.ADMIN_EMAIL.lower(),
        grupo="Manager_Compras",
        senha_hash=security.hash_bcrypt(config.ADMIN_SENHA_PADRAO),
        area_atuacao="Gestão", cargo="Administrador",
        instituto=config.INSTITUTOS[0], ativo=True,
    ))
    db.commit()
    log.info("Administrador criado: %s (trocar a senha no 1º login)",
             config.ADMIN_EMAIL)
    return True
