"""Regras de permissão sobre pedidos."""

from accounts.perfis import is_equipe

from .models import Status


def pode_ver_pedido(user, pedido):
    """Equipe vê todos; solicitante vê apenas os próprios."""
    if is_equipe(user):
        return True
    return pedido.criado_por_id == user.id


def pode_baixar_anexo(user, anexo):
    """Baixa anexo quem tem permissão sobre o pedido do anexo."""
    return pode_ver_pedido(user, anexo.pedido)


def pode_assumir(user, pedido):
    """Membro da equipe pode assumir apenas pedidos novos e sem responsável."""
    return (
        is_equipe(user)
        and pedido.responsavel_id is None
        and pedido.status == Status.NOVO
    )


def pode_alterar_tramitacao(user, pedido):
    """Somente o responsável atribuído altera a tramitação."""
    return is_equipe(user) and pedido.responsavel_id == user.id


def pode_excluir(user, pedido):
    """O solicitante exclui apenas as próprias requisições ainda não assumidas.

    Preserva o histórico de quem assumiu/tramitou: após a assunção (status
    diferente de 'Novo' ou responsável atribuído), a exclusão é bloqueada.
    """
    return (
        pedido.criado_por_id == user.id
        and pedido.responsavel_id is None
        and pedido.status == Status.NOVO
    )
