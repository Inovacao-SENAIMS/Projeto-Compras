"""Serviços (regras de negócio) do domínio de pedidos.

Concentram as operações que envolvem consistência/transação — em especial a
assunção de pedido, que precisa ser atômica para evitar que dois membros
assumam o mesmo pedido simultaneamente.
"""

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from accounts.perfis import is_manager

from .models import HistoricoStatus, Pedido, Status, STATUS_TERMINAIS


class RegraDeNegocioError(Exception):
    """Violação de regra de negócio (ex.: assumir pedido já assumido)."""


@transaction.atomic
def assumir_pedido(pedido_id, usuario):
    """Assume um pedido novo de forma atômica.

    Usa um UPDATE condicional (`responsavel IS NULL AND status = novo`). Se o
    número de linhas afetadas for 0, o pedido já foi assumido por outro membro
    entre o clique e a execução — tratando a concorrência.
    """
    agora = timezone.now()
    linhas = Pedido.objects.filter(
        pk=pedido_id, responsavel__isnull=True, status=Status.NOVO
    ).update(
        responsavel=usuario,
        status=Status.EM_COTACAO,
        assumido_em=agora,
        atualizado_em=agora,
    )
    if not linhas:
        raise RegraDeNegocioError(
            "Este pedido já foi assumido por outro membro da equipe."
        )

    pedido = Pedido.objects.get(pk=pedido_id)
    HistoricoStatus.objects.create(
        pedido=pedido,
        de=Status.NOVO,
        para=Status.EM_COTACAO,
        usuario=usuario,
        observacao=f"Pedido assumido por {usuario.get_username()}.",
    )
    return pedido


@transaction.atomic
def designar_pedido(pedido, gestor, novo_responsavel):
    """Designa/redesigna o responsável por uma requisição (ação da Gestão).

    - Requisição nova (sem responsável): vincula o responsável e move o status
      para "Em cotação".
    - Requisição já atribuída: redesigna (troca o responsável) mantendo o status.
    """
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)

    if pedido.finalizado:
        raise RegraDeNegocioError("Requisição já finalizada não pode ser designada.")

    anterior = pedido.responsavel
    pedido.responsavel = novo_responsavel

    if pedido.status == Status.NOVO:
        pedido.status = Status.EM_COTACAO
        pedido.assumido_em = timezone.now()
        de = Status.NOVO
        observacao = (
            f"Designado para {novo_responsavel.get_username()} "
            f"por {gestor.get_username()}."
        )
    else:
        de = pedido.status
        de_nome = anterior.get_username() if anterior else "—"
        observacao = (
            f"Redesignado de {de_nome} para {novo_responsavel.get_username()} "
            f"por {gestor.get_username()}."
        )

    pedido.save()
    HistoricoStatus.objects.create(
        pedido=pedido,
        de=de,
        para=pedido.status,
        usuario=gestor,
        observacao=observacao,
    )
    return pedido


@transaction.atomic
def alterar_status(
    pedido,
    usuario,
    novo_status,
    observacao="",
    retorno_final=None,
    modalidade=None,
    data_envio=None,
):
    """Altera o status de um pedido assumido. Só o responsável pode.

    Valida a transição e registra o histórico (quem, quando, de -> para).
    """
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)

    if not (is_manager(usuario) or pedido.responsavel_id == usuario.id):
        raise PermissionDenied(
            "Apenas o responsável (ou a gestão) pode alterar a tramitação."
        )

    if novo_status == pedido.status:
        raise RegraDeNegocioError("O pedido já está neste status.")

    if not pedido.pode_transitar_para(novo_status):
        raise RegraDeNegocioError(
            f"Transição de '{pedido.get_status_display()}' para "
            f"'{Status(novo_status).label}' não é permitida."
        )

    if novo_status == Status.CONCLUIDO:
        if not (retorno_final or "").strip():
            raise RegraDeNegocioError(
                "Informe o retorno final ao solicitar a conclusão do pedido."
            )

    de = pedido.status
    pedido.status = novo_status
    if retorno_final is not None:
        pedido.retorno_final = retorno_final
    if modalidade:
        pedido.modalidade = modalidade
    if data_envio:
        pedido.data_envio = data_envio
    if novo_status in STATUS_TERMINAIS:
        pedido.concluido_em = timezone.now()
    pedido.save()

    HistoricoStatus.objects.create(
        pedido=pedido,
        de=de,
        para=novo_status,
        usuario=usuario,
        observacao=observacao,
    )
    return pedido


@transaction.atomic
def criar_pedido(form, solicitante):
    """Cria o pedido a partir de um PedidoForm (dados validados)."""
    pedido = form.save(commit=False)
    pedido.criado_por = solicitante
    pedido.solicitante_nome = (
        pedido.solicitante_nome
        or solicitante.get_full_name()
        or solicitante.get_username()
    )
    pedido.status = Status.NOVO
    pedido.save()

    HistoricoStatus.objects.create(
        pedido=pedido,
        de="",
        para=Status.NOVO,
        usuario=solicitante,
        observacao="Pedido criado pelo solicitante.",
    )
    return pedido
