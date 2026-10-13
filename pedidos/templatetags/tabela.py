from django import template
from django.utils.html import format_html

register = template.Library()


@register.simple_tag(takes_context=True)
def th_ordenavel(context, campo, rotulo):
    """Renderiza um <th> clicável que ordena a tabela (preservando os filtros)."""
    request = context.get("request")
    if request is None:
        return format_html("<th>{}</th>", rotulo)

    params = request.GET.copy()
    ordem = params.get("ordenar") or ""
    direcao = params.get("dir") or "asc"

    proxima = "desc" if (ordem == campo and direcao == "asc") else "asc"
    params["ordenar"] = campo
    params["dir"] = proxima
    url = "?" + params.urlencode()

    ativo = " ativo" if ordem == campo else ""
    if ordem == campo:
        icone = "bi-sort-up" if direcao == "asc" else "bi-sort-down"
    else:
        icone = "bi-arrow-down-up"

    return format_html(
        '<th><a class="ordenar{}" href="{}">{} <i class="bi {}"></i></a></th>',
        ativo,
        url,
        rotulo,
        icone,
    )
