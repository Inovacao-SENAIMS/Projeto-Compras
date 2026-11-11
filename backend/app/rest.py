"""
rest.py — superfície RESTful da API (Task 3).

Os "actions" legados (POST /api/{acao}, envelope {ok,data,erro}) continuam
funcionando para compatibilidade; este módulo expõe os MESMOS casos de uso
com semântica REST: recursos no path, Bearer token no header Authorization
e códigos HTTP corretos (400 regra de negócio, 401 sessão, 404 não achado).

IMPORTANTE: este router deve ser registrado ANTES do catch-all
POST /api/{acao} no main.py (ordem de registro = prioridade de rota).
"""
import base64
import re
from urllib.parse import quote

from fastapi import Depends, HTTPException, Query, Request, Response
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from .database import get_db
from .deps import ErroNegocio, usuario_autenticado
from .routers import agregacoes, anexos, auth, pedidos, reset, usuarios
from . import oidc
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/api")

MSG_SESSAO = re.compile(r"sess[iã]o expirada", re.IGNORECASE)


def _token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    m = re.match(r"^Bearer\s+(.+)$", auth, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _usuario(request: Request, db: Session = Depends(get_db)):
    try:
        return usuario_autenticado(db, _token(request))
    except ErroNegocio as e:
        raise HTTPException(401, e.mensagem)


def _rodar(fn, db: Session, *args):
    """Chama a lógica de negócio e traduz o envelope para REST."""
    try:
        resp = fn(db, *args)
    except ErroNegocio as e:
        msg = e.mensagem
        raise HTTPException(401 if MSG_SESSAO.search(msg) else 400, msg)
    if not resp.get("ok", False):
        msg = resp.get("erro") or "Erro desconhecido."
        raise HTTPException(401 if MSG_SESSAO.search(msg) else 400, msg)
    return resp.get("data")


# --------------------------------- auth ------------------------------------

@router.post("/auth/login")
def rest_login(body: dict, db: Session = Depends(get_db)):
    return _rodar(auth.api_login, db, body)


@router.post("/auth/cadastro", status_code=201)
def rest_cadastro(body: dict, db: Session = Depends(get_db)):
    return _rodar(auth.api_cadastrar_usuario, db, body)


@router.post("/auth/logout")
def rest_logout(request: Request, db: Session = Depends(get_db),
                usuario=Depends(_usuario)):
    return _rodar(auth.api_logout, db, usuario, {"_token": _token(request)})


@router.post("/auth/senha")
def rest_alterar_senha(request: Request, body: dict, db: Session = Depends(get_db),
                       usuario=Depends(_usuario)):
    body["_token"] = _token(request)  # usado p/ preservar a sessão atual
    return _rodar(usuarios.api_alterar_senha, db, usuario, body)


@router.post("/auth/reset/solicitar")
def rest_reset_solicitar(body: dict, db: Session = Depends(get_db)):
    return _rodar(reset.api_solicitar_reset_senha, db, body)


@router.post("/auth/reset/redefinir")
def rest_reset_redefinir(body: dict, db: Session = Depends(get_db)):
    return _rodar(reset.api_redefinir_senha, db, body)


# ---------------------------------- SSO (Entra ID) --------------------------

@router.get("/auth/sso/url")
def rest_sso_url():
    if not oidc.ativado():
        raise HTTPException(400, "SSO não configurado neste servidor.")
    try:
        return {"url": oidc.autorizacao_url()}
    except Exception:
        raise HTTPException(502, "Provedor de identidade inacessível.")


@router.get("/auth/sso/callback")
def rest_sso_callback(code: str = "", state: str = "",
                      db: Session = Depends(get_db)):
    """Entra ID volta aqui; trocamos code → sessão e 302 para a SPA."""
    try:
        oidc.estado_verificar(state)
        tokens = oidc.trocar_code(code)
        claims = oidc.validar_id_token(tokens.get("id_token", ""))
        token = oidc.provisionar(db, claims)
        return RedirectResponse(oidc.base_spa() + "#/sso/" + token, status_code=302)
    except Exception:
        return RedirectResponse(oidc.base_spa() + "#/sso/erro", status_code=302)


# ---------------------------------- me/usuários -----------------------------

@router.get("/me")
def rest_meus_dados(db: Session = Depends(get_db), usuario=Depends(_usuario)):
    return _rodar(usuarios.api_meus_dados, db, usuario, {})


@router.get("/usuarios")
def rest_listar_usuarios(db: Session = Depends(get_db), usuario=Depends(_usuario)):
    return _rodar(usuarios.api_listar_usuarios, db, usuario, {})


@router.post("/usuarios", status_code=201)
def rest_criar_usuario(body: dict, db: Session = Depends(get_db),
                       usuario=Depends(_usuario)):
    return _rodar(usuarios.api_criar_usuario_admin, db, usuario, body)


@router.patch("/usuarios/{email}")
def rest_alterar_usuario(email: str, body: dict, db: Session = Depends(get_db),
                         usuario=Depends(_usuario)):
    email = email.strip().lower()
    if "grupo" in body:
        return _rodar(usuarios.api_alterar_grupo_usuario, db, usuario,
                      {"email": email, "grupo": body["grupo"]})
    if "ativo" in body:
        return _rodar(usuarios.api_alterar_status_usuario, db, usuario,
                      {"email": email, "ativo": bool(body["ativo"])})
    raise HTTPException(400, "Informe 'grupo' ou 'ativo' no corpo.")


@router.delete("/usuarios/{email}")
def rest_excluir_usuario(email: str, db: Session = Depends(get_db),
                         usuario=Depends(_usuario)):
    return _rodar(usuarios.api_excluir_usuario, db, usuario,
                  {"email": email.strip().lower()})


@router.get("/responsaveis")
def rest_responsaveis(db: Session = Depends(get_db), usuario=Depends(_usuario)):
    return _rodar(usuarios.api_lista_responsaveis, db, usuario, {})


# ---------------------------------- pedidos ---------------------------------

@router.get("/pedidos")
def rest_listar_pedidos(db: Session = Depends(get_db), usuario=Depends(_usuario),
                        status: str = "", modalidade: str = ""):
    return _rodar(pedidos.api_listar_pedidos, db, usuario,
                  {"status": status, "modalidade": modalidade})


@router.post("/pedidos", status_code=201)
def rest_criar_pedido(body: dict, db: Session = Depends(get_db),
                      usuario=Depends(_usuario)):
    return _rodar(pedidos.api_criar_pedido, db, usuario, body)


@router.get("/pedidos/{numero}")
def rest_detalhar_pedido(numero: str, db: Session = Depends(get_db),
                         usuario=Depends(_usuario)):
    return _rodar(pedidos.api_detalhar_pedido, db, usuario, {"numero": numero})


@router.delete("/pedidos/{numero}")
def rest_excluir_pedido(numero: str, db: Session = Depends(get_db),
                        usuario=Depends(_usuario)):
    return _rodar(pedidos.api_excluir_pedido, db, usuario, {"numero": numero})


@router.post("/pedidos/{numero}/enviar")
def rest_enviar_pedido(numero: str, db: Session = Depends(get_db),
                       usuario=Depends(_usuario)):
    return _rodar(pedidos.api_enviar_pedido, db, usuario, {"numero": numero})


@router.post("/pedidos/{numero}/assumir")
def rest_assumir_pedido(numero: str, db: Session = Depends(get_db),
                        usuario=Depends(_usuario)):
    return _rodar(pedidos.api_assumir_pedido, db, usuario, {"numero": numero})


@router.post("/pedidos/{numero}/designar")
def rest_designar_pedido(numero: str, body: dict,
                         db: Session = Depends(get_db), usuario=Depends(_usuario)):
    body["numero"] = numero
    return _rodar(pedidos.api_designar_pedido, db, usuario, body)


@router.post("/pedidos/{numero}/tramitar")
def rest_tramitar_pedido(numero: str, body: dict,
                         db: Session = Depends(get_db), usuario=Depends(_usuario)):
    body["numero"] = numero
    return _rodar(pedidos.api_tramitar_pedido, db, usuario, body)


# ---------------------------------- anexos ----------------------------------

@router.get("/pedidos/{numero}/anexos")
def rest_listar_anexos(numero: str, db: Session = Depends(get_db),
                       usuario=Depends(_usuario)):
    return _rodar(anexos.api_listar_anexos, db, usuario, {"numero": numero})


@router.post("/pedidos/{numero}/anexos", status_code=201)
def rest_anexar_arquivo(numero: str, body: dict, db: Session = Depends(get_db),
                        usuario=Depends(_usuario)):
    body["numero"] = numero
    return _rodar(anexos.api_anexar_arquivo, db, usuario, body)


@router.get("/anexos/{aid}/arquivo")
def rest_baixar_arquivo(aid: str, db: Session = Depends(get_db),
                        usuario=Depends(_usuario)):
    data = _rodar(anexos.api_baixar_arquivo, db, usuario, {"id": aid})
    nome = data["nome"]
    ascii_fallback = re.sub(r"[^A-Za-z0-9._-]", "_", nome) or "anexo"
    conteudo = base64.b64decode(data["base64"])
    return Response(
        content=conteudo,
        media_type=data.get("mime") or "application/octet-stream",
        headers={
            "Content-Disposition":
                f"attachment; filename=\"{ascii_fallback}\"; "
                f"filename*=UTF-8''{quote(nome)}",
        },
    )


@router.get("/documentos")
def rest_documentos(db: Session = Depends(get_db), usuario=Depends(_usuario)):
    return _rodar(anexos.api_listar_documentos, db, usuario, {})


# -------------------------------- agregações --------------------------------

@router.get("/dashboard")
def rest_dashboard(db: Session = Depends(get_db), usuario=Depends(_usuario)):
    return _rodar(agregacoes.api_dashboard, db, usuario, {})


@router.get("/performance")
def rest_performance(db: Session = Depends(get_db), usuario=Depends(_usuario),
                     de: str = "", ate: str = "",
                     usuario_filtro: str = Query("", alias="usuario")):
    return _rodar(agregacoes.api_performance, db, usuario,
                  {"de": de, "ate": ate, "usuario": usuario_filtro})


@router.get("/config")
def rest_config(db: Session = Depends(get_db)):
    return _rodar(agregacoes.api_config, db, {})
