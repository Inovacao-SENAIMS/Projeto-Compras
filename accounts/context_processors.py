"""Context processor que expõe o perfil do usuário aos templates."""

from .perfis import is_equipe as _is_equipe
from .perfis import is_manager as _is_manager
from .perfis import is_time_compras as _is_time
from .perfis import perfil as _perfil


def perfil(request):
    user = getattr(request, "user", None)
    return {
        "is_equipe": _is_equipe(user),
        "is_manager": _is_manager(user),
        "is_time_compras": _is_time(user),
        "perfil_nome": _perfil(user),
    }
