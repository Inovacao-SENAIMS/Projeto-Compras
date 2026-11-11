"""routers/anexos.py — port de Anexos.gs (anexar/listar/documentos/baixar)."""
import base64

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import security
from ..deps import (
    STATUS_TERMINAIS,
    ErroNegocio,
    exigir,
    is_equipe,
    is_super,
    nome_exibicao,
    buscar_usuario,
)
from ..models import Anexo, Pedido
from ..routers.pedidos import get_pedido, pode_ver
from ..storage import ler_arquivo, salvar_anexo


def api_anexar_arquivo(db: Session, usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {numero}")
    exigir(pode_ver(p, usuario), "Sem permissão para anexar nesta requisição.")
    exigir(str(p.status) not in STATUS_TERMINAIS, "Requisição finalizada não aceita anexos.")

    salvo = salvar_anexo(db, numero, payload, usuario)
    db.commit()
    return {"ok": True, "data": salvo}


def api_listar_anexos(db: Session, usuario, payload: dict):
    numero = str(payload.get("numero") or "")
    p = get_pedido(db, numero)
    exigir(p, f"Requisição não encontrada: {numero}")
    exigir(pode_ver(p, usuario), "Sem permissão para ver os anexos desta requisição.")

    ls = db.scalars(
        select(Anexo).where(Anexo.numero_req == numero).order_by(Anexo.enviado_em.asc())
    ).all()
    return {"ok": True, "data": [{
        "id": a.id, "tipo": a.tipo, "nome_original": a.nome_original,
        "enviado_por": nome_exibicao(db, a.enviado_por),
        "enviado_em": security.iso(a.enviado_em),
    } for a in ls]}


def api_listar_documentos(db: Session, usuario, payload: dict):
    exigir(is_equipe(usuario), "Apenas a equipe de compras pode consultar os documentos.")

    pedidos = {p.numero: p for p in db.scalars(select(Pedido)).all()}
    docs = []
    for a in db.scalars(select(Anexo).order_by(Anexo.enviado_em.desc())).all():
        # SuperUsuário é invisível nos relatórios/listagens
        u = buscar_usuario(db, a.enviado_por)
        if u and is_super(u):
            continue
        p = pedidos.get(a.numero_req)
        docs.append({
            "id": a.id,
            "numero_req": a.numero_req,
            "tipo": a.tipo or "documentacao",
            "nome_original": a.nome_original or "",
            "enviado_por": nome_exibicao(db, a.enviado_por),
            "enviado_por_email": str(a.enviado_por or "").lower(),
            "enviado_em": security.iso(a.enviado_em),
            "produto": p.produto if p else "",
            "solicitante_nome": p.solicitante_nome if p else "",
            "responsavel_nome": nome_exibicao(db, p.responsavel) if (p and p.responsavel) else "",
            "status": str(p.status) if p else "",
        })
    return {"ok": True, "data": docs}


def api_baixar_arquivo(db: Session, usuario, payload: dict):
    aid = str(payload.get("id") or "")
    a = db.get(Anexo, aid)
    exigir(a, f"Anexo não encontrado: {aid}")

    p = get_pedido(db, a.numero_req)
    exigir(p, "Requisição não encontrada para o anexo.")
    exigir(pode_ver(p, usuario), "Sem permissão para baixar este anexo.")

    try:
        conteudo = ler_arquivo(a.caminho)
    except OSError:
        raise ErroNegocio("Arquivo indisponível no armazenamento.")

    return {
        "ok": True,
        "data": {
            "nome": a.nome_original,
            "mime": "application/octet-stream",
            "base64": base64.b64encode(conteudo).decode("ascii"),
        },
    }
