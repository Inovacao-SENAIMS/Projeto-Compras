"""Helpers de perfil.

Perfis definidos por grupos do Django:

- ``UserISI_IST``      -> usuário comum (solicitante): registra, vê as próprias
  e acompanha o andamento.
- ``Time_Compras``     -> time de compras: vê as requisições atribuídas a si e
  toma as decisões (tramita).
- ``Manager_Compras``  -> gestão: designa requisições aos usuários de compras,
  acompanha prazos/andamento e também pode assumir/tramitar.
- superusuário         -> acesso total (tratado como todos os perfis).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from .grupos import GROUP_MANAGER, GROUP_TIME, GROUP_USERISI, GRUPOS


def criar_grupos():
    """Garante a existência dos grupos de perfil (idempotente)."""
    for nome in GRUPOS:
        Group.objects.get_or_create(name=nome)


def is_superusuario(user):
    return bool(user) and user.is_authenticated and user.is_superuser


def is_time_compras(user):
    """True se pertence ao Time de Compras (ou é superusuário)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name=GROUP_TIME).exists()


def is_manager(user):
    """True se é gestor de compras (ou superusuário)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name=GROUP_MANAGER).exists()


def is_equipe(user):
    """Quem enxerga TODAS as requisições (Time de Compras ou Gestão)."""
    return is_time_compras(user) or is_manager(user)


def is_solicitante(user):
    """Usuário comum autenticado que não é da equipe de compras."""
    return bool(user) and user.is_authenticated and not is_equipe(user)


def perfil(user):
    """Rótulo do perfil, para uso em templates."""
    if not user or not user.is_authenticated:
        return ""
    if user.is_superuser:
        return "SuperUsuário/ADM"
    if is_manager(user):
        return GROUP_MANAGER
    if is_time_compras(user):
        return GROUP_TIME
    return GROUP_USERISI


def usuarios_time_compras():
    """Usuários do Time de Compras (destinatários da designação do gestor)."""
    User = get_user_model()
    return (
        User.objects.filter(groups__name=GROUP_TIME, is_active=True)
        .order_by("username")
    )
