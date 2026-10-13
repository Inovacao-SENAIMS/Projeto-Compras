from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def configuracoes(request):
    """Página de configurações (placeholder nesta etapa)."""
    return render(request, "accounts/configuracoes.html")
