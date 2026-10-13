from datetime import datetime

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from accounts.decorators import equipe_required, gestor_required, solicitante_required
from accounts.perfis import nome_exibicao, usuarios_time_compras

from . import permissoes, services
from .forms import AnexosForm, PedidoForm, TramitacaoForm
from .models import Anexo, Pedido, Status, TipoAnexo


def salvar_anexos(pedido, arquivos, usuario, tipo=TipoAnexo.DOCUMENTACAO):
    """Persiste os arquivos enviados como Anexo do pedido."""
    for arquivo in arquivos:
        Anexo.objects.create(
            pedido=pedido,
            tipo=tipo,
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
        possui_cotacao = request.POST.get("possui_cotacao") == "sim"
        anexos_form = AnexosForm(
            request.POST, request.FILES, possui_cotacao=possui_cotacao
        )
        if form.is_valid() and anexos_form.is_valid():
            pedido = services.criar_pedido(form, request.user)
            salvar_anexos(
                pedido,
                anexos_form.cleaned_data.get("arquivos", []),
                request.user,
                TipoAnexo.DOCUMENTACAO,
            )
            if possui_cotacao:
                salvar_anexos(
                    pedido,
                    anexos_form.cleaned_data.get("arquivos_cotacao") or [],
                    request.user,
                    TipoAnexo.COTACAO,
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
@require_POST
def pedido_enviar(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk, criado_por=request.user)
    try:
        services.enviar_pedido(pedido, request.user)
    except services.RegraDeNegocioError as erro:
        messages.error(request, str(erro))
    else:
        messages.success(request, "Requisição enviada para a equipe de compras.")
    return redirect("pedidos:painel")


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
    contexto = {"pedidos": pedidos}
    if permissoes.pode_designar(request.user):
        contexto["responsaveis"] = usuarios_time_compras()
    return render(request, "pedidos/equipe/lista.html", contexto)


@equipe_required
def equipe_detalhe(request, pk):
    pedido = get_object_or_404(
        Pedido.objects.select_related("responsavel", "criado_por"), pk=pk
    )
    pode_tramitar = permissoes.pode_alterar_tramitacao(request.user, pedido) and bool(
        pedido.transicoes_permitidas
    )
    form = TramitacaoForm(pedido=pedido) if pode_tramitar else None

    pode_designar = permissoes.pode_designar(request.user) and not pedido.finalizado
    responsaveis = usuarios_time_compras() if pode_designar else None

    return render(
        request,
        "pedidos/equipe/detalhe.html",
        {
            "pedido": pedido,
            "form": form,
            "pode_tramitar": pode_tramitar,
            "pode_designar": pode_designar,
            "responsaveis": responsaveis,
        },
    )


@equipe_required
@require_POST
def equipe_designar(request, pk):
    """Designa/redesigna o responsável por uma requisição (apenas Gestão)."""
    if not permissoes.pode_designar(request.user):
        raise PermissionDenied("Apenas a gestão pode designar responsáveis.")

    pedido = get_object_or_404(Pedido, pk=pk)
    responsavel = usuarios_time_compras().filter(pk=request.POST.get("responsavel")).first()
    if responsavel is None:
        messages.error(request, "Selecione um usuário válido do Time de Compras.")
        return redirect("pedidos:equipe_detalhe", pk=pk)

    try:
        services.designar_pedido(pedido, request.user, responsavel)
    except services.RegraDeNegocioError as erro:
        messages.error(request, str(erro))
    else:
        messages.success(
            request,
            f"Requisição {pedido.numero} designada para {responsavel.get_username()}.",
        )
    return redirect("pedidos:equipe_lista")


@require_POST
@equipe_required
def equipe_assumir(request, pk):
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        services.assumir_pedido(pedido.pk, request.user)
    except services.RegraDeNegocioError as erro:
        messages.error(request, str(erro))
    else:
        messages.success(request, "Requisição assumida. Status alterado para Em Análise.")
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
        request,
        "pedidos/equipe/tramitar.html",
        {"pedido": pedido, "form": form, "edicao_aberta": bool(form.errors)},
    )


# ---------------------------------------------------------------------------
# Performance do Time (Gestão / Superusuário)
# ---------------------------------------------------------------------------

def _data(valor):
    try:
        return datetime.strptime(valor, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


@gestor_required
def performance(request):
    """Painel de performance do Time de Compras (apenas Gestão/Superusuário)."""
    inicio = _data(request.GET.get("inicio"))
    fim = _data(request.GET.get("fim"))

    pedidos = Pedido.objects.all()
    if inicio:
        pedidos = pedidos.filter(criado_em__date__gte=inicio)
    if fim:
        pedidos = pedidos.filter(criado_em__date__lte=fim)

    contagens = {
        item["responsavel"]: item
        for item in pedidos.filter(responsavel__isnull=False)
        .values("responsavel")
        .annotate(
            total=Count("id"),
            em_analise=Count("id", filter=Q(status=Status.EM_ANALISE)),
            concluida=Count("id", filter=Q(status=Status.CONCLUIDA)),
            cancelada=Count("id", filter=Q(status=Status.CANCELADA)),
        )
    }

    linhas = []
    for membro in usuarios_time_compras(incluir_inativos=True):
        item = contagens.get(membro.pk, {})
        tempos = [
            d
            for d in (
                p.lead_time_dias
                for p in pedidos.filter(responsavel=membro, status=Status.CONCLUIDA)
            )
            if d is not None
        ]
        linhas.append(
            {
                "membro": membro,
                "nome": nome_exibicao(membro),
                "total": item.get("total", 0),
                "em_analise": item.get("em_analise", 0),
                "concluida": item.get("concluida", 0),
                "cancelada": item.get("cancelada", 0),
                "lead_medio": round(sum(tempos) / len(tempos), 1) if tempos else None,
            }
        )

    totais = pedidos.aggregate(
        total=Count("id"),
        sem_responsavel=Count("id", filter=Q(responsavel__isnull=True)),
        em_analise=Count("id", filter=Q(status=Status.EM_ANALISE)),
        concluida=Count("id", filter=Q(status=Status.CONCLUIDA)),
        cancelada=Count("id", filter=Q(status=Status.CANCELADA)),
    )

    grafico = {
        "labels": [linha["nome"] for linha in linhas],
        "valores": [linha["total"] for linha in linhas],
    }

    return render(
        request,
        "pedidos/equipe/performance.html",
        {
            "linhas": linhas,
            "totais": totais,
            "grafico": grafico,
            "inicio": inicio.isoformat() if inicio else "",
            "fim": fim.isoformat() if fim else "",
        },
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
