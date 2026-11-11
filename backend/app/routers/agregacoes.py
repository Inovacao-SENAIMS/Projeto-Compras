"""routers/agregacoes.py — port de Dashboard.gs, Performance.gs e Config.gs."""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config, security
from ..deps import (
    STATUS,
    STATUS_TERMINAIS,
    buscar_usuario,
    exigir,
    is_equipe,
    is_manager,
    is_super,
    is_valido,
    nome_exibicao,
)
from ..models import Pedido, Usuario
from ..routers.pedidos import lead_time_dias


def _invisivel(db: Session, email: str) -> bool:
    """SuperUsuário é invisível nos relatórios."""
    u = buscar_usuario(db, email)
    return bool(u and is_super(u))


# ------------------------------- Dashboard --------------------------------

def api_dashboard(db: Session, usuario: Usuario, payload: dict):
    pedidos = db.scalars(select(Pedido)).all()
    if not is_equipe(usuario):
        em = str(usuario.email).lower()
        pedidos = [p for p in pedidos if str(p.criado_por).lower() == em]

    cont_por_status = {s: 0 for s in
                       ("aberta", "enviada", "em_analise", "concluida", "cancelada")}
    por_mes = {}
    por_instituto = {inst: 0 for inst in config.INSTITUTOS}

    usuarios = {u.email.lower(): u for u in db.scalars(select(Usuario)).all()}

    for p in pedidos:
        st = str(p.status)
        if st in cont_por_status:
            cont_por_status[st] += 1
        if p.criado_em:
            chave = f"{p.criado_em.year}-{p.criado_em.month:02d}"
            por_mes[chave] = por_mes.get(chave, 0) + 1

        u = usuarios.get(str(p.criado_por).lower())
        if u and is_super(u):
            continue  # SuperUsuário não conta no gráfico por instituto
        inst = str(u.instituto or "—") if u else "—"
        por_instituto[inst] = por_instituto.get(inst, 0) + 1

    # últimos 12 meses (do mês corrente para trás)
    meses = []
    hoje = security.agora()
    for i in range(11, -1, -1):
        ano, mes = hoje.year, hoje.month - i
        while mes <= 0:
            mes += 12
            ano -= 1
        chave = f"{ano}-{mes:02d}"
        meses.append({"chave": chave, "rotulo": f"{mes:02d}/{ano}",
                      "total": por_mes.get(chave, 0)})

    return {"ok": True, "data": {
        "total": len(pedidos),
        "pendentes": cont_por_status["aberta"] + cont_por_status["enviada"]
        + cont_por_status["em_analise"],
        "concluidas": cont_por_status["concluida"],
        "canceladas": cont_por_status["cancelada"],
        "por_status": cont_por_status,
        "por_mes": meses,
        "por_instituto": [{"instituto": k, "total": v} for k, v in por_instituto.items()],
    }}


# ------------------------------ Performance -------------------------------

def api_performance(db: Session, usuario: Usuario, payload: dict):
    exigir(is_manager(usuario), "Página exclusiva da Gestão.")

    de = _parse_data(payload.get("de"))
    ate = _parse_data(payload.get("ate"), fim_do_dia=True)
    membro = str(payload.get("usuario") or "").strip().lower()

    pedidos = db.scalars(select(Pedido)).all()
    pedidos = [p for p in pedidos
               if not (de and p.criado_em < de)
               and not (ate and p.criado_em > ate)
               and (not membro or str(p.responsavel or "").lower() == membro)]

    cnt = {"total": len(pedidos), "sem_responsavel": 0, "em_analise": 0,
           "concluida": 0, "cancelada": 0}
    por_membro = {}

    for p in pedidos:
        st = str(p.status)
        if not p.responsavel:
            cnt["sem_responsavel"] += 1
        if st == STATUS["EM_ANALISE"]:
            cnt["em_analise"] += 1
        if st == STATUS["CONCLUIDA"]:
            cnt["concluida"] += 1
        if st == STATUS["CANCELADA"]:
            cnt["cancelada"] += 1

        em = str(p.responsavel or "").lower()
        if em and _invisivel(db, em):
            continue  # SuperUsuário invisível no relatório
        if em not in por_membro:
            por_membro[em] = {
                "email": em, "nome": nome_exibicao(db, em),
                "atribuidas": 0, "em_analise": 0, "concluida": 0,
                "cancelada": 0, "lead_soma": 0, "lead_n": 0,
            }
        m = por_membro[em]
        m["atribuidas"] += 1
        if st == STATUS["EM_ANALISE"]:
            m["em_analise"] += 1
        if st == STATUS["CONCLUIDA"]:
            m["concluida"] += 1
        if st == STATUS["CANCELADA"]:
            m["cancelada"] += 1
        lead = lead_time_dias(p)
        if lead is not None and st == STATUS["CONCLUIDA"]:
            m["lead_soma"] += lead
            m["lead_n"] += 1

    tabela = []
    for m in por_membro.values():
        m["lead_medio"] = round(m["lead_soma"] / m["lead_n"], 1) if m["lead_n"] else None
        del m["lead_soma"], m["lead_n"]
        tabela.append(m)
    tabela.sort(key=lambda m: m["atribuidas"], reverse=True)

    membros = [{"email": str(u.email).lower(), "nome": u.nome_completo}
               for u in db.scalars(select(Usuario)).all()
               if is_valido(u) and is_equipe(u) and not is_super(u)]

    return {"ok": True, "data": {
        "indicadores": cnt, "membros": tabela, "opcoes_membros": membros,
    }}


def _parse_data(valor, fim_do_dia=False):
    if not valor:
        return None
    try:
        d = datetime.fromisoformat(str(valor))
    except ValueError:
        return None
    if fim_do_dia:
        d = d.replace(hour=23, minute=59, second=59, microsecond=999999)
    # comparações no banco são naive UTC
    return d.replace(tzinfo=None) if d.tzinfo else d


# --------------------------------- Config ---------------------------------

def api_config(db: Session, payload: dict):
    """Pública — fonte de verdade para o frontend (bootstrap do app.js)."""
    from .. import oidc

    return {"ok": True, "data": {
        "institutos": config.INSTITUTOS,
        "modalidades": config.MODALIDADES,
        "urgencias": config.URGENCIAS,
        "status": config.STATUS,
        "sso": oidc.ativado(),
    }}
