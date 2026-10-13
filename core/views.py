from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect

from accounts.perfis import is_equipe


@login_required
def home(request):
    """Ponto de entrada único: encaminha para a área conforme o perfil."""
    if is_equipe(request.user):
        return redirect("pedidos:equipe_lista")
    return redirect("pedidos:meus_pedidos")
