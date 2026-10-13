"""Regras de permissão sobre pedidos."""

from accounts.perfis import is_manager, is_time_compras

from .models import Status


def pode_ver_pedido(user, pedido):
    """Equipe (time/gestão) vê todos; usuário comum vê apenas os próprios."""
    if is_time_compras(user) or is_manager(user):
        return True
    return pedido.criado_por_id == user.id


def pode_baixar_anexo(user, anexo):
    """Baixa anexo quem tem permissão sobre o pedido do anexo."""
    return pode_ver_pedido(user, anexo.pedido)


def pode_enviar(user, pedido):
    """O solicitante envia a própria requisição enquanto ela está 'Aberta'."""
    return pedido.criado_por_id == user.id and pedido.status == Status.ABERTA


def pode_assumir(user, pedido):
    """Time de Compras ou Gestão assume requisições enviadas e sem responsável."""
    return (
        (is_time_compras(user) or is_manager(user))
        and pedido.responsavel_id is None
        and pedido.status == Status.ENVIADA
    )


def pode_designar(user):
    """Apenas a Gestão (Manager_Compras / superusuário) designa responsáveis."""
    return is_manager(user)


def pode_alterar_tramitacao(user, pedido):
    """A Gestão tramita qualquer pedido; o Time apenas os que assumiu."""
    if not (is_time_compras(user) or is_manager(user)):
        return False
    if is_manager(user):
        return not pedido.finalizado
    return pedido.responsavel_id == user.id


def pode_excluir(user, pedido):
    """O solicitante exclui apenas as próprias requisições ainda 'Aberta'."""
    return pedido.criado_por_id == user.id and pedido.status == Status.ABERTA
