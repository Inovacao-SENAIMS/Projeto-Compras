from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from accounts.decorators import equipe_required, solicitante_required

from . import permissoes, services
from .forms import AnexosForm, PedidoForm, TramitacaoForm
from .models import Anexo, Pedido


def salvar_anexos(pedido, arquivos, usuario):
    """Persiste os arquivos enviados como Anexo do pedido."""
    for arquivo in arquivos:
        Anexo.objects.create(
            pedido=pedido,
            arquivo=arquivo,
            nome_original=arquivo.name,
            enviado_por=usuario,
        )


# ---------------------------------------------------------------------------
# Área do solicitante
# ---------------------------------------------------------------------------

@solicitante_required
def painel(request):
    """Painel de Requisições: registra, lista e exclui requisições próprias."""
    abrir_modal = False
    if request.method == "POST":
        form = PedidoForm(request.POST)
        anexos_form = AnexosForm(request.POST, request.FILES)
        if form.is_valid() and anexos_form.is_valid():
            pedido = services.criar_pedido(form, request.user)
            salvar_anexos(
                pedido, anexos_form.cleaned_data.get("arquivos", []), request.user
            )
            messages.success(request, "Requisição registrada com sucesso.")
            return redirect("pedidos:painel")
        # Houve erro de validação: reabre o modal com as mensagens.
        abrir_modal = True
    else:
        form = PedidoForm()
        anexos_form = AnexosForm()

    pedidos = (
        Pedido.objects.filter(criado_por=request.user)
        .select_related("responsavel")
        .prefetch_related("anexos")
    )
    return render(
        request,
        "pedidos/solicitante/painel.html",
        {
            "form": form,
            "anexos_form": anexos_form,
            "pedidos": pedidos,
            "abrir_modal": abrir_modal,
        },
    )


@solicitante_required
def pedido_detalhe(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk, criado_por=request.user)
    return render(request, "pedidos/solicitante/detalhe.html", {"pedido": pedido})


@solicitante_required
@require_POST
def pedido_excluir(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk, criado_por=request.user)
    if not permissoes.pode_excluir(request.user, pedido):
        messages.error(
            request,
            "Não é possível excluir: a requisição já foi assumida pela equipe de compras.",
        )
        return redirect("pedidos:painel")

    pedido.delete()
    messages.success(request, "Requisição excluída com sucesso.")
    return redirect("pedidos:painel")


# ---------------------------------------------------------------------------
# Área da equipe de compras
# ---------------------------------------------------------------------------

@equipe_required
def equipe_lista(request):
    pedidos = (
        Pedido.objects.select_related("responsavel", "criado_por")
        .prefetch_related("anexos")
        .all()
    )
    return render(request, "pedidos/equipe/lista.html", {"pedidos": pedidos})


@equipe_required
def equipe_detalhe(request, pk):
    pedido = get_object_or_404(
        Pedido.objects.select_related("responsavel", "criado_por"), pk=pk
    )
    pode_tramitar = permissoes.pode_alterar_tramitacao(request.user, pedido) and bool(
        pedido.transicoes_permitidas
    )
    form = TramitacaoForm(pedido=pedido) if pode_tramitar else None
    return render(
        request,
        "pedidos/equipe/detalhe.html",
        {"pedido": pedido, "form": form, "pode_tramitar": pode_tramitar},
    )


@require_POST
@equipe_required
def equipe_assumir(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        services.assumir_pedido(pedido.pk, request.user)
    except services.RegraDeNegocioError as erro:
        messages.error(request, str(erro))
    else:
        messages.success(request, "Pedido assumido. Status alterado para Em cotação.")
    return redirect("pedidos:equipe_detalhe", pk=pk)


@equipe_required
def equipe_tramitar(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk)

    if not permissoes.pode_alterar_tramitacao(request.user, pedido):
        raise PermissionDenied("Apenas o responsável pelo pedido pode tramitá-lo.")

    if not pedido.transicoes_permitidas:
        messages.warning(request, "Este pedido não possui transições disponíveis.")
        return redirect("pedidos:equipe_detalhe", pk=pk)

    if request.method == "POST":
        form = TramitacaoForm(request.POST, request.FILES, pedido=pedido)
        if form.is_valid():
            try:
                services.alterar_status(
                    pedido,
                    request.user,
                    form.cleaned_data["status"],
                    observacao=form.cleaned_data.get("observacao", ""),
                    retorno_final=form.cleaned_data.get("retorno_final", ""),
                    modalidade=form.cleaned_data.get("modalidade", ""),
                    data_envio=form.cleaned_data.get("data_envio"),
                )
            except services.RegraDeNegocioError as erro:
                messages.error(request, str(erro))
            else:
                salvar_anexos(pedido, form.cleaned_data.get("arquivos", []), request.user)
                messages.success(request, "Tramitação atualizada com sucesso.")
                return redirect("pedidos:equipe_detalhe", pk=pk)
    else:
        form = TramitacaoForm(pedido=pedido)

    return render(
        request, "pedidos/equipe/tramitar.html", {"pedido": pedido, "form": form}
    )


# ---------------------------------------------------------------------------
# Anexos: download mediado por permissão (nada é servido publicamente)
# ---------------------------------------------------------------------------

@login_required
def anexo_download(request, pk):
    anexo = get_object_or_404(Anexo.objects.select_related("pedido"), pk=pk)
    if not permissoes.pode_baixar_anexo(request.user, anexo):
        raise PermissionDenied("Você não tem permissão para baixar este anexo.")
    try:
        arquivo = anexo.arquivo.open("rb")
    except FileNotFoundError as exc:
        raise Http404("Arquivo não encontrado.") from exc
    return FileResponse(arquivo, as_attachment=True, filename=anexo.nome_original)
