"""Filtros e exportação CSV das listas de requisições."""

import csv
from datetime import datetime

from django.http import HttpResponse
from django.utils import timezone

from accounts.perfis import nome_exibicao, usuarios_time_compras

from .models import Modalidade

CAMPOS_DATA = [
    "abertura_ini",
    "abertura_fim",
    "envio_ini",
    "envio_fim",
    "encerramento_ini",
    "encerramento_fim",
]


def _data(valor):
    try:
        return datetime.strptime(valor, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _fmt(dt):
    return timezone.localtime(dt).strftime("%d/%m/%Y - %H:%M") if dt else ""


def aplicar_filtros(request, queryset):
    """Aplica os filtros da barra (responsável, modalidade, datas e lead time)."""
    get = request.GET

    responsavel = get.get("responsavel") or ""
    modalidade = get.get("modalidade") or ""
    if responsavel.isdigit():
        queryset = queryset.filter(responsavel_id=responsavel)
    if modalidade:
        queryset = queryset.filter(modalidade=modalidade)

    datas = {campo: _data(get.get(campo)) for campo in CAMPOS_DATA}
    if datas["abertura_ini"]:
        queryset = queryset.filter(criado_em__date__gte=datas["abertura_ini"])
    if datas["abertura_fim"]:
        queryset = queryset.filter(criado_em__date__lte=datas["abertura_fim"])
    if datas["envio_ini"]:
        queryset = queryset.filter(data_envio__date__gte=datas["envio_ini"])
    if datas["envio_fim"]:
        queryset = queryset.filter(data_envio__date__lte=datas["envio_fim"])
    if datas["encerramento_ini"]:
        queryset = queryset.filter(concluido_em__date__gte=datas["encerramento_ini"])
    if datas["encerramento_fim"]:
        queryset = queryset.filter(concluido_em__date__lte=datas["encerramento_fim"])

    # Lead time é calculado em Python (dias entre envio e encerramento/hoje).
    lead_min = get.get("lead_min") or ""
    lead_max = get.get("lead_max") or ""
    if lead_min.isdigit() or lead_max.isdigit():
        minimo = int(lead_min) if lead_min.isdigit() else 0
        maximo = int(lead_max) if lead_max.isdigit() else 10**9
        queryset = [
            pedido
            for pedido in queryset
            if pedido.lead_time_dias is not None
            and minimo <= pedido.lead_time_dias <= maximo
        ]

    return queryset


def contexto_filtros(request):
    get = request.GET
    valores = {
        "responsavel": get.get("responsavel") or "",
        "modalidade": get.get("modalidade") or "",
        "lead_min": get.get("lead_min") or "",
        "lead_max": get.get("lead_max") or "",
    }
    for campo in CAMPOS_DATA:
        valores[campo] = get.get(campo) or ""

    return {
        "filtro_responsaveis": usuarios_time_compras(incluir_inativos=True),
        "filtro_modalidades": Modalidade.choices,
        "filtro_valores": valores,
        "filtro_ativo": any(valores.values()),
    }


ORDENACAO = {
    "numero": "numero",
    "responsavel": "responsavel__first_name",
    "item": "produto",
    "modalidade": "modalidade",
    "abertura": "criado_em",
    "envio": "data_envio",
    "status": "status",
    "encerramento": "concluido_em",
}


def _chave_ordenacao(campo):
    def chave(pedido):
        if campo == "numero":
            return pedido.numero or ""
        if campo == "responsavel":
            return pedido.responsavel.get_full_name().lower() if pedido.responsavel_id else ""
        if campo == "item":
            return pedido.produto.lower()
        if campo == "modalidade":
            return pedido.get_modalidade_display() or ""
        if campo == "status":
            return pedido.get_status_display() or ""
        if campo == "abertura":
            return (pedido.criado_em is None, pedido.criado_em or timezone.now())
        if campo == "envio":
            return (pedido.data_envio is None, pedido.data_envio or timezone.now())
        if campo == "encerramento":
            return (pedido.concluido_em is None, pedido.concluido_em or timezone.now())
        if campo == "lead":
            return (pedido.lead_time_dias is None, pedido.lead_time_dias or 0)
        return ""

    return chave


def aplicar_ordenacao(request, pedidos):
    """Ordena a lista conforme ?ordenar=<campo>&dir=asc|desc."""
    campo = request.GET.get("ordenar") or ""
    reverso = (request.GET.get("dir") or "asc") == "desc"

    if isinstance(pedidos, list):
        if campo:
            pedidos.sort(key=_chave_ordenacao(campo), reverse=reverso)
        return pedidos

    if campo == "lead":
        lista = list(pedidos)
        lista.sort(key=_chave_ordenacao("lead"), reverse=reverso)
        return lista

    campo_db = ORDENACAO.get(campo)
    if not campo_db:
        return pedidos
    return pedidos.order_by(("-" if reverso else "") + campo_db)


def exportar_csv(pedidos):
    """Gera o CSV (Excel-friendly) da lista de requisições filtrada."""
    resposta = HttpResponse(content_type="text/csv; charset=utf-8")
    resposta["Content-Disposition"] = 'attachment; filename="requisicoes.csv"'
    resposta.write("\ufeff")  # BOM (acentos no Excel)
    escritor = csv.writer(resposta, delimiter=";")
    escritor.writerow(
        [
            "Nº",
            "Item",
            "Responsável",
            "Modalidade",
            "Status",
            "Data de Abertura",
            "Data de Envio",
            "Data de Encerramento",
            "Lead Time (dias)",
        ]
    )
    for pedido in pedidos:
        escritor.writerow(
            [
                pedido.numero or pedido.pk,
                pedido.produto,
                nome_exibicao(pedido.responsavel) if pedido.responsavel_id else "",
                pedido.get_modalidade_display() or "",
                pedido.get_status_display(),
                _fmt(pedido.criado_em),
                _fmt(pedido.data_envio),
                _fmt(pedido.concluido_em),
                pedido.lead_time_dias if pedido.lead_time_dias is not None else "",
            ]
        )
    return resposta
