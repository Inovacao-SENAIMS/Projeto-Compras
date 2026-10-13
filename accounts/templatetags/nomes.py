from django import template

from accounts.perfis import nome_exibicao

register = template.Library()


@register.filter
def nome_usuario(user):
    """Exibe o nome amigável de um usuário (em vez do login/e-mail)."""
    return nome_exibicao(user)
