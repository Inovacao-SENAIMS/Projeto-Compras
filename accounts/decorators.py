"""Decorators de autorização por perfil."""

from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied

from .perfis import is_equipe, is_solicitante


def equipe_required(view):
    """Área da equipe de compras (autenticado + pertence à equipe)."""

    @wraps(view)
    @login_required
    def wrapper(request, *args, **kwargs):
        if not is_equipe(request.user):
            raise PermissionDenied
        return view(request, *args, **kwargs)

    return wrapper


def solicitante_required(view):
    """Área do solicitante (autenticado + fora da equipe)."""

    @wraps(view)
    @login_required
    def wrapper(request, *args, **kwargs):
        if not is_solicitante(request.user):
            raise PermissionDenied
        return view(request, *args, **kwargs)

    return wrapper
