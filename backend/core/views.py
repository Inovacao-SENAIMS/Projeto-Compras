from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from accounts.perfis import is_equipe

from pedidos.dashboard import dados_dashboard
from pedidos.models import Pedido


@login_required
def home(request):
    """Home = dashboard de requisições (dados conforme o perfil)."""
    if is_equipe(request.user):
        pedidos = Pedido.objects.all()
        escopo = "Todas as requisições"
    else:
        pedidos = Pedido.objects.filter(criado_por=request.user)
        escopo = "Suas requisições"

    contexto = dados_dashboard(pedidos)
    contexto["escopo"] = escopo
    return render(request, "core/dashboard.html", contexto)
