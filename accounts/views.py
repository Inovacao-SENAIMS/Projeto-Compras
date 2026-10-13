from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import CadastroForm
from .perfis import is_manager, pode_gerenciar, usuarios_time_compras


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
    """Configurações: dados do usuário e (Gestão/Superusuário) gestão de usuários."""
    perfil = getattr(request.user, "perfil", None)
    contexto = {"perfil": perfil, "gerenciar_usuarios": False}

    if request.user.is_superuser:
        contexto["gerenciar_usuarios"] = True
        contexto["titulo_lista"] = "Todos os usuários"
        contexto["usuarios"] = get_user_model().objects.all().order_by("username")
    elif is_manager(request.user):
        contexto["gerenciar_usuarios"] = True
        contexto["titulo_lista"] = "Membros do Time de Compras"
        contexto["usuarios"] = usuarios_time_compras(incluir_inativos=True)

    return render(request, "accounts/configuracoes.html", contexto)


def _usuario_para_gerenciar(request, pk):
    alvo = get_object_or_404(get_user_model(), pk=pk)
    if not pode_gerenciar(request.user, alvo):
        raise PermissionDenied("Você não tem permissão para gerenciar este usuário.")
    return alvo


@login_required
@require_POST
def usuario_ativar(request, pk):
    alvo = _usuario_para_gerenciar(request, pk)
    alvo.is_active = True
    alvo.save(update_fields=["is_active"])
    messages.success(request, f"Usuário {alvo.get_username()} ativado.")
    return redirect("accounts:configuracoes")


@login_required
@require_POST
def usuario_inativar(request, pk):
    alvo = _usuario_para_gerenciar(request, pk)
    alvo.is_active = False
    alvo.save(update_fields=["is_active"])
    messages.success(request, f"Usuário {alvo.get_username()} inativado.")
    return redirect("accounts:configuracoes")


@login_required
@require_POST
def usuario_excluir(request, pk):
    alvo = _usuario_para_gerenciar(request, pk)
    nome = alvo.get_username()
    try:
        alvo.delete()
    except ProtectedError:
        messages.error(
            request,
            f"Não é possível excluir {nome}: há requisições vinculadas a este usuário.",
        )
    else:
        messages.success(request, f"Usuário {nome} excluído.")
    return redirect("accounts:configuracoes")
