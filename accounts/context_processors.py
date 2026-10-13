"""Context processor que expõe o perfil do usuário aos templates."""

from .perfis import is_equipe as _is_equipe
from .perfis import perfil as _perfil


def perfil(request):
    user = getattr(request, "user", None)
    return {
        "is_equipe": _is_equipe(user),
        "perfil_nome": _perfil(user),
    }
