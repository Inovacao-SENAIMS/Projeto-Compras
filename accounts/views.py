from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from .forms import CadastroForm


def cadastro(request):
    """Cadastro público de usuário (solicitante)."""
    if request.user.is_authenticated:
        return redirect("core:home")

    if request.method == "POST":
        form = CadastroForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(
                request, "Cadastro realizado com sucesso! Faça login para continuar."
            )
            return redirect("login")
    else:
        form = CadastroForm()
    return render(request, "accounts/cadastro.html", {"form": form})


@login_required
def configuracoes(request):
    """Página de configurações (placeholder nesta etapa)."""
    return render(request, "accounts/configuracoes.html")
