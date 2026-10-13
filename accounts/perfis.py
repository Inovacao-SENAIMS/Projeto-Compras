"""Helpers de perfil.

O perfil é derivado da associação ao grupo `Equipe de Compras`:

- quem pertence ao grupo (ou é superusuário) é da EQUIPE DE COMPRAS;
- qualquer outro usuário autenticado é tratado como SOLICITANTE.

Assim, adicionar novos integrantes à equipe é só uma questão de
adicioná-los ao grupo (via /admin ou comando), sem alterar código.
"""

from django.contrib.auth.models import Group

from .grupos import GROUP_EQUIPE, GRUPOS


def criar_grupos():
    """Garante a existência dos grupos de perfil (idempotente)."""
    for nome in GRUPOS:
        Group.objects.get_or_create(name=nome)


def is_equipe(user):
    """True se o usuário pertence à equipe de compras."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name=GROUP_EQUIPE).exists()


def is_solicitante(user):
    """True se o usuário é um solicitante (autenticado e fora da equipe)."""
    return bool(user) and user.is_authenticated and not is_equipe(user)


def perfil(user):
    """Rótulo do perfil, para uso em templates."""
    if is_equipe(user):
        return GROUP_EQUIPE
    if is_solicitante(user):
        return "Solicitante"
    return ""
