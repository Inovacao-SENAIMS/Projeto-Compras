"""Serviços (regras de negócio) do domínio de pedidos.

Concentram as operações que envolvem consistência/transação — em especial a
assunção de requisição, que precisa ser atômica para evitar que dois membros
assumam a mesma requisição simultaneamente.
"""

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from accounts.perfis import is_manager

from .models import HistoricoStatus, Pedido, Status, STATUS_TERMINAIS


class RegraDeNegocioError(Exception):
    """Violação de regra de negócio."""


@transaction.atomic
def criar_pedido(form, solicitante):
    """Cria a requisição (status inicial: Aberta)."""
    pedido = form.save(commit=False)
    pedido.criado_por = solicitante
    pedido.solicitante_nome = (
        pedido.solicitante_nome
        or solicitante.get_full_name()
        or solicitante.get_username()
    )
    pedido.status = Status.ABERTA
    pedido.save()

    HistoricoStatus.objects.create(
        pedido=pedido,
        de="",
        para=Status.ABERTA,
        usuario=solicitante,
        observacao="Requisição criada pelo solicitante.",
    )
    return pedido


@transaction.atomic
def enviar_pedido(pedido, usuario):
    """Envia a requisição (Aberta -> Enviada) e grava a Data de Envio."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)

    if pedido.criado_por_id != usuario.id:
        raise PermissionDenied("Apenas o solicitante pode enviar a requisição.")
    if pedido.status != Status.ABERTA:
        raise RegraDeNegocioError(
            "Somente requisições com status 'Aberta' podem ser enviadas."
        )

    pedido.status = Status.ENVIADA
    pedido.data_envio = timezone.localdate()
    pedido.save()

    HistoricoStatus.objects.create(
        pedido=pedido,
        de=Status.ABERTA,
        para=Status.ENVIADA,
        usuario=usuario,
        observacao="Requisição enviada pelo solicitante.",
    )
    return pedido


@transaction.atomic
def assumir_pedido(pedido_id, usuario):
    """Assume uma requisição enviada (Enviada -> Em Análise), de forma atômica.

    Usa um UPDATE condicional (`responsavel IS NULL AND status = enviada`). Se o
    número de linhas afetadas for 0, a requisição já foi assumida por outro
    membro — tratando a concorrência.
    """
    agora = timezone.now()
    linhas = Pedido.objects.filter(
        pk=pedido_id, responsavel__isnull=True, status=Status.ENVIADA
    ).update(
        responsavel=usuario,
        status=Status.EM_ANALISE,
        assumido_em=agora,
        atualizado_em=agora,
    )
    if not linhas:
        raise RegraDeNegocioError(
            "Esta requisição já foi assumida por outro membro da equipe."
        )

    pedido = Pedido.objects.get(pk=pedido_id)
    HistoricoStatus.objects.create(
        pedido=pedido,
        de=Status.ENVIADA,
        para=Status.EM_ANALISE,
        usuario=usuario,
        observacao=f"Requisição assumida por {usuario.get_username()}.",
    )
    return pedido


@transaction.atomic
def designar_pedido(pedido, gestor, novo_responsavel):
    """Designa/redesigna o responsável por uma requisição (ação da Gestão)."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)

    if pedido.finalizado:
        raise RegraDeNegocioError("Requisição já finalizada não pode ser designada.")
    if pedido.status == Status.ABERTA:
        raise RegraDeNegocioError(
            "A requisição ainda não foi enviada pelo solicitante."
        )

    anterior = pedido.responsavel
    pedido.responsavel = novo_responsavel

    if pedido.status == Status.ENVIADA:
        pedido.status = Status.EM_ANALISE
        pedido.assumido_em = timezone.now()
        de = Status.ENVIADA
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
):
    """Altera o status de uma requisição em análise. Só o responsável/gestão pode."""
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

    if novo_status == Status.CONCLUIDA:
        if not (retorno_final or "").strip():
            raise RegraDeNegocioError(
                "Informe o retorno final ao solicitar a conclusão da requisição."
            )

    de = pedido.status
    pedido.status = novo_status
    if retorno_final is not None:
        pedido.retorno_final = retorno_final
    if modalidade:
        pedido.modalidade = modalidade
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
