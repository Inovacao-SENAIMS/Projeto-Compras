"""
main.py — roteador principal da API "Projeto Compras" (substituto do Code.gs).

Protocolo compatível com o Apps Script: POST /api/{acao} com corpo
{token, payload} → envelope {ok, data, erro}. As views do frontend não
mudam; só o transporte (fetch em vez da Bridge postMessage).
"""
import os
import logging

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config
from .database import Base, engine, get_db
from .deps import ErroNegocio, usuario_autenticado
from .models import Usuario
from .seed import garantir_admin

from .routers import agregacoes, anexos, auth, pedidos, reset, usuarios
from .routers.auth import api_login, api_logout, api_cadastrar_usuario
from .routers.anexos import (
    api_anexar_arquivo, api_baixar_arquivo, api_listar_anexos, api_listar_documentos,
)
from .routers.pedidos import (
    api_assumir_pedido, api_criar_pedido, api_designar_pedido, api_detalhar_pedido,
    api_enviar_pedido, api_excluir_pedido, api_listar_pedidos, api_tramitar_pedido,
)
from .routers.usuarios import (
    api_alterar_grupo_usuario, api_alterar_senha, api_alterar_status_usuario,
    api_criar_usuario_admin, api_excluir_usuario, api_lista_responsaveis,
    api_listar_usuarios, api_meus_dados,
)
from .routers.agregacoes import api_config, api_dashboard, api_performance
from .routers.reset import api_redefinir_senha, api_solicitar_reset_senha

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("projeto-compras")

app = FastAPI(title="Projeto Compras API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # em produção atrás do nginx é same-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ações sem sessão (igual ao ROTA_PUBLICA do Code.gs)
PUBLICAS = {
    "login", "cadastrarUsuario", "solicitarResetSenha", "redefinirSenha", "config",
}

# Mapa de ações (igual ao ROTAS_API)
ROTAS = {
    "login": api_login,
    "cadastrarUsuario": api_cadastrar_usuario,
    "logout": api_logout,
    "solicitarResetSenha": api_solicitar_reset_senha,
    "redefinirSenha": api_redefinir_senha,
    "listarPedidos": api_listar_pedidos,
    "detalharPedido": api_detalhar_pedido,
    "criarPedido": api_criar_pedido,
    "enviarPedido": api_enviar_pedido,
    "assumirPedido": api_assumir_pedido,
    "designarPedido": api_designar_pedido,
    "tramitarPedido": api_tramitar_pedido,
    "excluirPedido": api_excluir_pedido,
    "anexarArquivo": api_anexar_arquivo,
    "listarAnexos": api_listar_anexos,
    "listarDocumentos": api_listar_documentos,
    "baixarArquivo": api_baixar_arquivo,
    "meusDados": api_meus_dados,
    "listarUsuarios": api_listar_usuarios,
    "alterarStatusUsuario": api_alterar_status_usuario,
    "excluirUsuario": api_excluir_usuario,
    "criarUsuarioAdmin": api_criar_usuario_admin,
    "alterarGrupoUsuario": api_alterar_grupo_usuario,
    "alterarSenha": api_alterar_senha,
    "listaResponsaveis": api_lista_responsaveis,
    "dashboard": api_dashboard,
    "performance": api_performance,
    "config": api_config,
}


class RequisicaoBody(BaseModel):
    token: str = ""
    payload: dict = {}


@app.get("/api/health")
def health():
    return {"ok": True, "data": {"status": "up", "version": app.version}}


@app.post("/api/{acao}")
def chamar(acao: str, body: RequisicaoBody, db=Depends(get_db)):
    rota = ROTAS.get(acao)
    if not rota:
        return {"ok": False, "erro": f"Ação desconhecida: {acao}"}

    payload = dict(body.payload or {})
    if body.token:
        payload["_token"] = str(body.token)  # p/ ações que revogam a própria sessão

    try:
        if acao in PUBLICAS:
            return rota(db, payload)
        usuario = usuario_autenticado(db, body.token)
        return rota(db, usuario, payload)
    except ErroNegocio as e:
        db.rollback()
        return {"ok": False, "erro": e.mensagem}
    except Exception:
        db.rollback()
        log.exception("Erro inesperado na ação %s", acao)
        return {"ok": False, "erro": "Erro interno do servidor."}


# ------------------------------ inicialização ------------------------------
# Substitui inicializar() + criarGestorInicial() do Setup.gs (idempotente).

def inicializar() -> None:
    os.makedirs(config.ANEXOS_DIR, exist_ok=True)
    Base.metadata.create_all(engine)
    if not config.SEED_ADMIN:
        return
    from .database import SessionLocal

    db = SessionLocal()
    try:
        garantir_admin(db)
    finally:
        db.close()


@app.on_event("startup")
def startup() -> None:
    inicializar()
