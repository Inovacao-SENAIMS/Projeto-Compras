"""routers/pedidos.py — port de Pedidos.gs (domínio central).

Regras preservadas:
  - visibilidade (solicitante vê o próprio; equipe vê tudo);
  - assunção atômica (UPDATE condicional — substitui LockService + recheck);
  - retorno final obrigatório na conclusão;
  - histórico a cada mudança; exclusão em cascata (anexos + histórico).
"""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import security
from ..deps import (
    STATUS_TERMINAIS,
    TRANSICOES,
    ErroNegocio,
    buscar_usuario,
    exigir,
    is_equipe,
    is_manager,
    is_super,
    nome_exibicao,
)
from ..models import Anexo, HistoricoStatus, Pedido, Usuario
from ..storage import salvar_anexo


def agora():
    return security.agora()


def get_pedido(db: Session, numero: str) -> Pedido | None:
    return db.get(Pedido, str(numero or ""))


def lead_time_dias(p: Pedido) -> int | None:
    """Igual ao Django: dias entre envio e encerramento (ou hoje)."""
    if not p.data_envio:
        return None
    envio = p.data_envio.replace(hour=0, minute=0, second=0, microsecond=0)
    fim = (p.concluido_em or agora())
    fim = fim.replace(hour=0, minute=0, second=0, microsecond=0)
    return (fim - envio).days


def registrar_historico(db: Session, numero: str, de: str, para: str,
                        usuario: Usuario, observacao: str) -> None:
    db.add(HistoricoStatus(
        numero_req=str(numero), de=de or "", para=para,
        usuario=str(usuario.email).lower(),
        observacao=str(observacao or ""), criado_em=agora(),
    ))


def serializar_pedido(db: Session, p: Pedido) -> dict:
    return {
        "numero": p.numero,
        "produto": p.produto,
        "descricao_objeto": p.descricao_objeto,
        "quantidade": p.quantidade or 1,
        "modalidade": p.modalidade,
        "urgencia": p.urgencia,
        "possui_cotacao": bool(p.possui_cotacao),
        "solicitante_nome": p.solicitante_nome,
        "criado_por": str(p.criado_por).lower(),
        "data_envio": security.iso(p.data_envio),
        "status": str(p.status),
        "responsavel": str(p.responsavel or "").lower(),
        "responsavel_nome": nome_exibicao(db, p.responsavel) if p.responsavel else "",
        "retorno_final": p.retorno_final or "",
        "criado_em": security.iso(p.criado_em),
        "assumido_em": security.iso(p.assumido_em),
        "concluido_em": security.iso(p.concluido_em),
        "lead_time_dias": lead_time_dias(p),
    }


def pode_ver(p: Pedido, usuario: Usuario) -> bool:
    """owner vê os seus; equipe vê tudo (Anexos.gs SessaoPodeVerPedido)."""
    return is_equipe(usuario) or str(p.criado_por).lower() == str(usuario.email).lower()


def proximo_numero(db: Session) -> str:
    """REQ-000001 — max+1 dentro da transação (SQLite serializa gravações)."""
    from sqlalchemy import func

    maior = db.scalar(
        select(func.max(Pedido.numero)).where(Pedido.numero.like("REQ-%"))
    )
    n = int(maior[4:] or 0) + 1 if maior else 1
    return "REQ-" + f"{n:06d}"


# --------------------------------- listar ---------------------------------

def api_listar_pedidos(db: Session, usuario: Usuario, payload: dict):
    stmt = select(Pedido)
    if not is_equipe(usuario):
        stmt = stmt.where(Pedido.criado_por == str(usuario.email).lower())
    if payload.get("status"):
        stmt = stmt.where(Pedido.status == str(payload["status"]))
    if payload.get("modalidade"):
        stmt = stmt.where(Pedido.modalidade == str(payload["modalidade"]))
    pedidos = db.scalars(stmt.order_by(Pedido.criado_em.desc())).all()
    return {"ok": True, "data": [serializar_pedido(db, p) for p in pedidos]}


def api_detalhar_pedido(db: Session, usuario: Usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {payload.get('numero')}")
    if not is_equipe(usuario):
        exigir(p.criado_por == str(usuario.email).lower(),
               "Sem permissão para ver esta requisição.")

    historicos = db.scalars(
        select(HistoricoStatus).where(HistoricoStatus.numero_req == numero)
        .order_by(HistoricoStatus.criado_em.asc())
    ).all()
    anexos = db.scalars(
        select(Anexo).where(Anexo.numero_req == numero).order_by(Anexo.enviado_em.asc())
    ).all()

    return {
        "ok": True,
        "data": {
            "pedido": serializar_pedido(db, p),
            "historicos": [{
                "de": h.de, "para": h.para,
                "usuario": nome_exibicao(db, h.usuario),
                "observacao": h.observacao, "criado_em": security.iso(h.criado_em),
            } for h in historicos],
            "anexos": [{
                "id": a.id, "tipo": a.tipo, "nome_original": a.nome_original,
                "enviado_por": nome_exibicao(db, a.enviado_por),
                "enviado_em": security.iso(a.enviado_em),
            } for a in anexos],
            "transicoes": TRANSICOES.get(str(p.status), []),
        },
    }


# --------------------------------- criar ----------------------------------

def api_criar_pedido(db: Session, usuario: Usuario, payload: dict):
    produto = str(payload.get("produto") or "").strip()
    exigir(produto, "Informe o produto.")

    modalidade = str(payload.get("modalidade") or "")
    exigir(len(modalidade) > 0, "Modalidade RCA obrigatória.")

    quantidade = int(payload.get("quantidade") or 1)
    if quantidade < 1:
        quantidade = 1

    tipos_enviados = [str(a.get("tipo") or "") for a in (payload.get("anexos") or [])]
    # Documentação obrigatória; Cotação obrigatória quando possui_cotacao.
    exigir("documentacao" in tipos_enviados,
           "Documentação (anexo) é obrigatória no registro da requisição.")

    p = Pedido(
        numero=proximo_numero(db),
        produto=produto,
        descricao_objeto=str(payload.get("descricao_objeto") or "").strip(),
        quantidade=quantidade,
        modalidade=modalidade,
        urgencia=str(payload.get("urgencia") or "baixa"),
        possui_cotacao=bool(payload.get("possui_cotacao")),
        solicitante_nome=str(payload.get("solicitante_nome") or "").strip()
        or nome_exibicao(db, usuario.email, usuario.nome_completo),
        criado_por=str(usuario.email).lower(),
        data_envio=None,
        status="aberta",
        responsavel="",
        retorno_final="",
        criado_em=agora(),
        atualizado_em=agora(),
    )
    if p.possui_cotacao:
        exigir("cotacao" in tipos_enviados,
               "Cotação (anexo) é obrigatória quando 'Possui cotação?' = Sim.")

    db.add(p)
    db.flush()
    registrar_historico(db, p.numero, "", "aberta", usuario,
                        "Requisição criada pelo solicitante.")
    for a in (payload.get("anexos") or []):
        salvar_anexo(db, p.numero, a, usuario)
    db.commit()
    return {"ok": True, "data": serializar_pedido(db, p)}


# --------------------------------- enviar ---------------------------------

def api_enviar_pedido(db: Session, usuario: Usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {payload.get('numero')}")

    exigir(str(p.criado_por).lower() == str(usuario.email).lower(),
           "Apenas o solicitante pode enviar a requisição.")
    exigir(str(p.status) == "aberta",
           "Somente requisições com status 'Aberta' podem ser enviadas.")

    p.status = "enviada"
    p.data_envio = agora()
    p.atualizado_em = agora()
    registrar_historico(db, p.numero, "aberta", "enviada", usuario,
                        "Requisição enviada pelo solicitante.")
    db.commit()
    return {"ok": True, "data": {"numero": p.numero, "status": "enviada"}}


# --------------------------------- assumir --------------------------------

def api_assumir_pedido(db: Session, usuario: Usuario, payload: dict):
    exigir(is_equipe(usuario), "Apenas a equipe de compras pode assumir requisições.")

    numero = str(payload.get("numero") or "")
    email = str(usuario.email).lower()

    # UPDATE condicional: substitui LockService + recheck (atômico no banco).
    res = db.execute(
        update(Pedido)
        .where(
            Pedido.numero == numero,
            Pedido.status == "enviada",
            Pedido.responsavel == "",
        )
        .values(status="em_analise", responsavel=email,
                assumido_em=agora(), atualizado_em=agora())
    )
    exigir(res.rowcount > 0,
           "Esta requisição já foi assumida por outro membro da equipe.")

    p = get_pedido(db, numero)
    registrar_historico(db, numero, "enviada", "em_analise", usuario,
                        "Requisição assumida por "
                        + nome_exibicao(db, email, usuario.nome_completo) + ".")
    db.commit()
    return {"ok": True, "data": {"numero": numero, "status": "em_analise"}}


# -------------------------------- designar --------------------------------

def api_designar_pedido(db: Session, usuario: Usuario, payload: dict):
    exigir(is_manager(usuario), "Apenas a Gestão pode designar/redesignar responsável.")

    email_resp = str(payload.get("responsavel") or "").strip().lower()
    exigir(email_resp, "Informe o novo responsável.")
    alvo = buscar_usuario(db, email_resp)
    exigir(alvo and is_valido(alvo), "Responsável inválido ou inativo.")
    exigir(is_equipe(alvo) or is_super(alvo),
           "O responsável deve ser membro da equipe de compras.")

    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {payload.get('numero')}")

    exigir(str(p.status) not in STATUS_TERMINAIS,
           "Requisição já finalizada não pode ser designada.")
    exigir(str(p.status) != "aberta",
           "A requisição ainda não foi enviada pelo solicitante.")

    if str(p.status) == "enviada":
        de = "enviada"
        observacao = (f"Designado para {nome_exibicao(db, email_resp, alvo.nome_completo)}"
                      f" por {nome_exibicao(db, usuario.email, usuario.nome_completo)}.")
        p.responsavel = email_resp
        p.status = "em_analise"
        p.assumido_em = agora()
    else:
        de = str(p.status)
        de_resp = nome_exibicao(db, p.responsavel) if p.responsavel else "—"
        observacao = (f"Redesignado de {de_resp} para "
                      f"{nome_exibicao(db, email_resp, alvo.nome_completo)}"
                      f" por {nome_exibicao(db, usuario.email, usuario.nome_completo)}.")
        p.responsavel = email_resp

    p.atualizado_em = agora()
    registrar_historico(db, numero, de, "em_analise", usuario, observacao)
    db.commit()
    return {"ok": True, "data": {"numero": numero, "responsavel": email_resp}}


# -------------------------------- tramitar --------------------------------

def api_tramitar_pedido(db: Session, usuario: Usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {payload.get('numero')}")

    eh_responsavel = str(p.responsavel or "").lower() == str(usuario.email).lower()
    exigir(eh_responsavel or is_manager(usuario),
           "Apenas o responsável (ou a gestão) pode alterar a tramitação.")

    novo = str(payload.get("status") or "")
    if novo == str(p.status):
        raise ErroNegocio("O pedido já está neste status.")
    permitidos = TRANSICOES.get(str(p.status), [])
    exigir(novo in permitidos,
           f"Transição de '{p.status}' para '{novo}' não é permitida.")

    de_anterior = str(p.status)
    if novo == "concluida":
        exigir(str(payload.get("retorno_final") or "").strip(),
               "Informe o retorno final ao solicitar a conclusão da requisição.")

    p.status = novo
    if payload.get("retorno_final") is not None:
        p.retorno_final = str(payload.get("retorno_final"))
    if payload.get("modalidade"):
        p.modalidade = str(payload.get("modalidade"))
    if novo in STATUS_TERMINAIS:
        p.concluido_em = agora()
    p.atualizado_em = agora()
    registrar_historico(db, numero, de_anterior, novo, usuario,
                        str(payload.get("observacao") or ""))
    db.commit()
    return {"ok": True, "data": {"numero": numero, "status": novo}}


# -------------------------------- excluir ---------------------------------

def api_excluir_pedido(db: Session, usuario: Usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {payload.get('numero')}")

    exigir(str(p.criado_por).lower() == str(usuario.email).lower(),
           "Apenas o solicitante pode excluir a requisição.")
    exigir(str(p.status) == "aberta" and not p.responsavel,
           "Requisição já assumida — exclusão bloqueada para preservar o histórico.")

    # anexos (arquivo no volume + auditoria) e histórico, em cascata
    anexos = db.scalars(select(Anexo).where(Anexo.numero_req == numero)).all()
    import os
    for a in anexos:
        try:
            if a.caminho and os.path.exists(a.caminho):
                os.remove(a.caminho)
        except OSError:
            pass
        db.delete(a)

    hist = db.scalars(select(HistoricoStatus).where(HistoricoStatus.numero_req == numero)).all()
    for h in hist:
        db.delete(h)

    db.delete(p)
    db.commit()
    return {"ok": True, "data": {"numero": numero}}
