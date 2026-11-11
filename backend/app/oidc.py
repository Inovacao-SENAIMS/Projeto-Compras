"""
oidc.py — SSO corporativo via Microsoft Entra ID (OIDC/OAuth2).

Modo híbrido: quem tem senha interna continua usando login/senha; quem usa
Entra entra com "Entrar com Microsoft". Na 1ª entrada, a conta é provisionada
automaticamente (e-mail institucional, perfil UserISI_IST — igual ao
auto-cadastro do sistema original).

Fluxo:
  1. GET  /api/auth/sso/url            → URL de autorização (state assinado)
  2. Entra autentica e volta para GET /api/auth/sso/callback?code&state
  3. Backend troca code por tokens, valida o id_token (JWKS, iss, aud, exp),
     provisiona/atrela o usuário e cria a sessão
  4. Redirect 302 → SPA #/sso/{token} (o frontend grava a sessão e vai ao app)

Configuração (env): OIDC_ENABLED, OIDC_ISSUER, OIDC_CLIENT_ID,
OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI, OIDC_SPA_BASE, SECRET_KEY.
"""
import base64
import hashlib
import hmac
import os
import secrets
import time

import httpx
from authlib.jose import JsonWebKey, JsonWebToken
from sqlalchemy.orm import Session

from . import config, security
from .deps import ErroNegocio, GRUPOS, exigir
from .models import Sessao, Usuario

# --------------------------------------------------------------- metadata ----

_meta = None  # cache do discovery do IdP


def ativado() -> bool:
    return bool(
        config.OIDC_ENABLED and config.OIDC_ISSUER
        and config.OIDC_CLIENT_ID and config.OIDC_CLIENT_SECRET
        and config.OIDC_REDIRECT_URI
    )


def _metadata() -> dict:
    global _meta
    if not _meta:
        url = config.OIDC_ISSUER.rstrip("/") + "/.well-known/openid-configuration"
        r = httpx.get(url, timeout=15)
        r.raise_for_status()
        _meta = r.json()
    return _meta


# --------------------------------------------------------------- state -------
# state assinado (HMAC-SHA256, chave SECRET_KEY): nonce.expiracao.assinatura

def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _chave() -> bytes:
    return (config.SECRET_KEY or os.urandom(32).hex()).encode()


def estado_assinar() -> str:
    nonce = secrets.token_hex(16)
    exp = str(int(time.time()) + 300)  # 5 min
    msg = f"{nonce}.{exp}".encode()
    sig = hmac.new(_chave(), msg, hashlib.sha256).digest()
    return f"{nonce}.{exp}.{_b64u(sig)}"


def estado_verificar(state: str) -> None:
    try:
        nonce, exp, sig_b64 = str(state).split(".")
        msg = f"{nonce}.{exp}".encode()
        esperado = hmac.new(_chave(), msg, hashlib.sha256).digest()
        if not hmac.compare_digest(esperado, _b64u_dec(sig_b64)):
            raise ValueError("assinatura")
        if int(exp) < time.time():
            raise ValueError("expirado")
    except (ValueError, TypeError):
        raise ErroNegocio("Estado do login SSO inválido ou expirado. Tente novamente.")


# --------------------------------------------------------------- fluxo OIDC --

def autorizacao_url() -> str:
    meta = _metadata()
    from urllib.parse import urlencode

    qs = urlencode({
        "response_type": "code",
        "client_id": config.OIDC_CLIENT_ID,
        "redirect_uri": config.OIDC_REDIRECT_URI,
        "scope": config.OIDC_SCOPES,
        "state": estado_assinar(),
        "prompt": "select_account",
    })
    return meta["authorization_endpoint"] + "?" + qs


def trocar_code(code: str) -> dict:
    """Code → token set (id_token + access_token)."""
    meta = _metadata()
    r = httpx.post(meta["token_endpoint"], timeout=15, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": config.OIDC_REDIRECT_URI,
        "client_id": config.OIDC_CLIENT_ID,
        "client_secret": config.OIDC_CLIENT_SECRET,
    })
    if r.status_code != 200:
        raise ErroNegocio("Falha ao validar o login corporativo. Tente novamente.")
    return r.json()


def validar_id_token(id_token: str) -> dict:
    """Verifica assinatura (JWKS), iss, aud e exp. Devolve os claims."""
    meta = _metadata()
    jwks = httpx.get(meta["jwks_uri"], timeout=15).json()
    # Entra ID assina com RS256 (RSASSA-PKCS1-v1_5); algoritmos simétricos
    # (HS256) são proibidos de propósito — exigem expor o segredo do cliente.
    algos = JsonWebToken(["RS256", "ES256"]).decode(
        id_token,
        JsonWebKey.import_key_set(jwks),
        claims_options={
            "iss": {"value": meta["issuer"]},
            "aud": {"value": config.OIDC_CLIENT_ID},
        },
    )
    algos.validate()
    claims = dict(algos)
    exp = claims.get("exp")
    if not exp or float(exp) < time.time():
        raise ErroNegocio("Token do login corporativo expirado.")
    return claims


# ------------------------------------------------------- provisionamento -----

def provisionar(db: Session, claims: dict) -> str:
    """Entra/atrela o usuário e cria a sessão. Devolve o token da sessão."""
    email = str(claims.get("email") or claims.get("preferred_username") or "").strip().lower()
    exigir(email, "A conta corporativa não informou um e-mail utilizável.")

    # domínio institucional — mesma regra do login/senha
    dominio = "@" + config.DOMINIO_EMAIL
    exigir(email.endswith(dominio),
           f"A conta corporativa precisa ser do domínio {dominio}.")

    u = db.query(Usuario).filter(Usuario.email == email).first()
    if not u:
        # provisionamento automático, igual ao auto-cadastro (UserISI_IST)
        u = Usuario(
            nome_completo=str(claims.get("name") or "").strip() or email.split("@")[0],
            email=email,
            grupo=GRUPOS["SOLICITANTE"],
            senha_hash="",        # sem senha: entra somente via SSO
            area_atuacao="", cargo="",
            instituto=str(claims.get("instituto") or ""),
            ativo=True,
        )
        db.add(u)
        db.commit()

    if not u.ativo:
        raise ErroNegocio("Usuário inativo. Fale com a Gestão.")

    token = security.novo_token()
    db.add(Sessao(token=token, email=email, expira_em=security.expiracao_sessao()))
    db.commit()
    return token


def base_spa() -> str:
    """Base do SPA para o redirect do callback."""
    base = config.OIDC_SPA_BASE
    if not base and config.OIDC_REDIRECT_URI:
        from urllib.parse import urlsplit
        p = urlsplit(config.OIDC_REDIRECT_URI)
        base = f"{p.scheme}://{p.netloc}"
    exigir(base, "OIDC_SPA_BASE ou OIDC_REDIRECT_URI devem estar configurados.")
    return base.rstrip("/")
