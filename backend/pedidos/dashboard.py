"""Agrega os dados do dashboard da Home (inspirado no design de referência)."""

from datetime import date

from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.utils import timezone

from accounts.instituicoes import Instituto

from .models import Status

MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

STATUS_ORDEM = [
    Status.ABERTA,
    Status.ENVIADA,
    Status.EM_ANALISE,
    Status.CONCLUIDA,
    Status.CANCELADA,
]

STATUS_CORES = {
    Status.ABERTA.value: "#94a3b8",
    Status.ENVIADA.value: "#00529B",
    Status.EM_ANALISE.value: "#F2A03D",
    Status.CONCLUIDA.value: "#1E8E5A",
    Status.CANCELADA.value: "#64748B",
}


def _ultimos_meses(quantidade=12):
    hoje = timezone.localdate()
    ano, mes = hoje.year, hoje.month
    lista = []
    for i in range(quantidade - 1, -1, -1):
        m = mes - i
        a = ano
        while m <= 0:
            m += 12
            a -= 1
        lista.append((a, m))
    return lista


def dados_dashboard(pedidos):
    """Retorna o contexto de números/gráficos a partir de um queryset de Pedido."""
    contagem = {
        item["status"]: item["n"]
        for item in pedidos.values("status").annotate(n=Count("id"))
    }

    por_status = [(s, contagem.get(s.value, 0)) for s in STATUS_ORDEM]
    status_json = [[s.label, contagem.get(s.value, 0), STATUS_CORES[s.value]] for s in STATUS_ORDEM]

    buckets = _ultimos_meses()
    inicio = date(buckets[0][0], buckets[0][1], 1)
    por_mes_qs = (
        pedidos.filter(criado_em__date__gte=inicio)
        .annotate(mes=TruncMonth("criado_em"))
        .values("mes")
        .annotate(n=Count("id"))
    )
    mapa_mes = {(item["mes"].year, item["mes"].month): item["n"] for item in por_mes_qs}

    mes_json = {
        "labels": [f"{MESES_ABREV[m - 1]}/{str(a)[2:]}" for a, m in buckets],
        "valores": [mapa_mes.get((a, m), 0) for a, m in buckets],
    }

    total = sum(n for _, n in por_status)
    pendentes = sum(
        n for s, n in por_status if s in (Status.ABERTA, Status.ENVIADA, Status.EM_ANALISE)
    )

    contagem_inst = {
        item["criado_por__perfil__instituto"]: item["n"]
        for item in pedidos.filter(criado_por__perfil__isnull=False)
        .values("criado_por__perfil__instituto")
        .annotate(n=Count("id"))
    }
    nao_informado = pedidos.filter(criado_por__perfil__isnull=True).count()

    inst_labels = [inst.label for inst in Instituto]
    inst_valores = [contagem_inst.get(inst.value, 0) for inst in Instituto]
    if nao_informado:
        inst_labels.append("Não informado")
        inst_valores.append(nao_informado)

    return {
        "total": total,
        "pendentes": pendentes,
        "concluidas": contagem.get(Status.CONCLUIDA.value, 0),
        "canceladas": contagem.get(Status.CANCELADA.value, 0),
        "por_status": por_status,
        "status_json": status_json,
        "mes_json": mes_json,
        "instituicao_json": {"labels": inst_labels, "valores": inst_valores},
        "tem_instituto": sum(inst_valores) > 0,
    }
