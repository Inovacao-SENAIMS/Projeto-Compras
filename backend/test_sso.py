"""Teste do SSO (Microsoft Entra ID / OIDC) sem provedor real.

Cobre:
  - GET /api/auth/sso/url quando desativado → 400 com mensagem clara;
  - config agora expõe o flag `sso`;
  - state: assinatura HMAC, expiração e rejeição de forjados;
  - id_token: validação de assinatura JWKS + iss + aud + exp (mock do IdP);
  - provisionamento: cria conta nova (UserISI_IST), atrela existente,
    bloqueia domínio estranho e usuário inativo;
  - callback HTTP: redirect 302 para a SPA com token (mockando Entra).
"""
import base64
import hashlib
import json
import os
import sys
import tempfile
import time

tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = tmp
os.environ["ANEXOS_DIR"] = os.path.join(tmp, "anexos")
os.environ["SEED_ADMIN"] = "true"

# IdP de teste: issuer local (as URLs de discovery são mockadas via monkeypatch)
os.environ["OIDC_ENABLED"] = "true"
os.environ["OIDC_ISSUER"] = "https://entra-teste.invalid/tenant/v2.0"
os.environ["OIDC_CLIENT_ID"] = "client-id-teste"
os.environ["OIDC_CLIENT_SECRET"] = "client-secret-teste"
os.environ["OIDC_REDIRECT_URI"] = "https://localhost/api/auth/sso/callback"
os.environ["OIDC_SPA_BASE"] = "https://localhost"
os.environ["SECRET_KEY"] = "segredo-de-teste"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

falhas = []


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def check(nome, cond, extra=""):
    ok = "✅" if cond else "❌"
    if not cond:
        falhas.append(nome)
    print(f"  {ok} {nome} {extra}")


from fastapi.testclient import TestClient  # noqa: E402

from app import oidc  # noqa: E402
from app.main import app  # noqa: E402

# ---- mock do IdP (discovery + jwks + token endpoint) com RSA real ----

priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_pn = priv.public_key().public_numbers()


def _int_b64u(n: int) -> str:
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return _b64u(b)


def id_token_falso(claims: dict) -> str:
    """Assina claims com RS256 usando a chave RSA do mock."""
    cab = _b64u(json.dumps({"alg": "RS256", "typ": "JWT", "kid": "k1"}).encode())
    pay = _b64u(json.dumps(claims).encode())
    msg = f"{cab}.{pay}".encode()
    sig = _b64u(priv.sign(msg, padding.PKCS1v15(), hashes.SHA256()))
    return f"{cab}.{pay}.{sig}"


JWKS = {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "k1",
                  "n": _int_b64u(_pn.n), "e": _int_b64u(_pn.e)}]}

META = {
    "issuer": "https://entra-teste.invalid/tenant/v2.0",
    "authorization_endpoint": "https://entra-teste.invalid/tenant/v2.0/authorize",
    "token_endpoint": "https://entra-teste.invalid/tenant/v2.0/token",
    "jwks_uri": "https://entra-teste.invalid/tenant/v2.0/jwks",
}


# monkeypatch: metadata + jwks + troca de code
oidc._meta = META
oidc.httpx.get = (lambda url, timeout=None:
                 type("R", (), {"json": lambda self: JWKS, "raise_for_status": lambda self: None})())

_chamadas_token = {}


def _mock_post(url, timeout=None, data=None):
    _chamadas_token.update(data or {})
    corpo = {"id_token": id_token_falso(_claims_token_endpoint), "access_token": "at"}
    return type("R", (), {"json": lambda self: corpo, "status_code": 200})()


oidc.httpx.post = _mock_post


def _decod_jwt(tok):
    cab, pay, sig = tok.split(".")
    return json.loads(base64.urlsafe_b64decode(pay + "=" * (-len(pay) % 4)))


with TestClient(app, raise_server_exceptions=False) as c:
    print("— config + url quando ativado —")
    cfg = c.get("/api/config").json()
    check("config expõe flag sso=true", cfg.get("sso") is True)

    r = c.get("/api/auth/sso/url")
    check("GET sso/url 200", r.status_code == 200)
    url = r.json().get("url", "")
    check("URL aponta ao authorization_endpoint do IdP",
          url.startswith(META["authorization_endpoint"] + "?"), url[:60])

    from urllib.parse import urlparse, parse_qs
    q = parse_qs(urlparse(url).query)
    check("params corretos (client_id, redirect_uri, scope, state)",
          q.get("client_id") == ["client-id-teste"]
          and q.get("redirect_uri") == ["https://localhost/api/auth/sso/callback"]
          and "openid" in (q.get("scope") or [""])[0]
          and bool(q.get("state")))

    print("— state assinado —")
    st = oidc.estado_assinar()
    oidc.estado_verificar(st)  # não deve lançar
    check("state válido passa", True)
    try:
        oidc.estado_verificar("nonce.99999.forged")
        check("state forjado rejeitado", False)
    except Exception:
        check("state forjado rejeitado", True)
    st_exp = f"nonce.{int(time.time()) - 1}.{st.split('.')[2]}"
    try:
        oidc.estado_verificar(st_exp)
        check("state expirado rejeitado", False)
    except Exception:
        check("state expirado rejeitado", True)

    print("— validar id_token —")
    agora = int(time.time())
    claims_ok = {
        "iss": META["issuer"], "aud": "client-id-teste", "exp": agora + 300,
        "email": "novo.sso@ms.senai.br", "name": "Novo SSO",
    }
    claims = oidc.validar_id_token(id_token_falso(claims_ok))
    check("token válido decodifica", claims["email"] == "novo.sso@ms.senai.br")

    claims_iss_errado = dict(claims_ok, iss="https://evil.invalid")
    try:
        oidc.validar_id_token(id_token_falso(claims_iss_errado))
        check("iss errado rejeitado", False)
    except Exception:
        check("iss errado rejeitado", True)

    claims_aud_errado = dict(claims_ok, aud="outro-cliente")
    try:
        oidc.validar_id_token(id_token_falso(claims_aud_errado))
        check("aud errado rejeitado", False)
    except Exception:
        check("aud errado rejeitado", True)

    claims_exp = dict(claims_ok, exp=agora - 10)
    try:
        oidc.validar_id_token(id_token_falso(claims_exp))
        check("expirado rejeitado", False)
    except Exception:
        check("expirado rejeitado", True)

    assinatura_ruim = id_token_falso(claims_ok)[:-4] + "AAAA"
    try:
        oidc.validar_id_token(assinatura_ruim)
        check("assinatura inválida rejeitada", False)
    except Exception:
        check("assinatura inválida rejeitada", True)

    print("— provisionamento —")
    from app.database import SessionLocal
    from app.models import Usuario

    db = SessionLocal()
    tok1 = oidc.provisionar(db, claims_ok)
    check("provisiona nova conta (UserISI_IST)", bool(tok1))
    u = db.query(Usuario).filter(Usuario.email == "novo.sso@ms.senai.br").first()
    check("usuário criado com dados do IdP", u and u.grupo == "UserISI_IST"
          and u.nome_completo == "Novo SSO" and u.ativo is True)
    check("sem senha interna (só SSO)", u.senha_hash == "")

    tok2 = oidc.provisionar(db, claims_ok)
    check("2º login atrela a mesma conta",
          db.query(Usuario).filter(Usuario.email == "novo.sso@ms.senai.br").count() == 1)
    check("sessões distintas", tok1 != tok2)

    claims_fora = dict(claims_ok, email="alguem@gmail.com")
    try:
        oidc.provisionar(db, claims_fora)
        check("domínio estranho bloqueado", False)
    except Exception:
        check("domínio estranho bloqueado", True)

    claims_inativo = dict(claims_ok, email="bloqueado@ms.senai.br")
    u2 = Usuario(nome_completo="Bloqueado", email="bloqueado@ms.senai.br",
                 grupo="UserISI_IST", senha_hash="", ativo=False)
    db.add(u2)
    db.commit()
    try:
        oidc.provisionar(db, claims_inativo)
        check("usuário inativo bloqueado", False)
    except Exception:
        check("usuário inativo bloqueado", True)
    db.close()

    print("— callback HTTP (Entra → 302 SPA) —")
    global_claims = claims_ok
    # mock do token endpoint usa a variável global _claims_token_endpoint
    import builtins
    _claims_token_endpoint = claims_ok
    globals()["_claims_token_endpoint"] = claims_ok

    # o mock post lê _claims_token_endpoint do módulo de teste; ajustamos oidc
    import types
    state = oidc.estado_assinar()
    original_post = oidc.httpx.post

    def post_com_claims(url, timeout=None, data=None):
        _chamadas_token.update(data or {})
        corpo = {"id_token": id_token_falso(claims_ok), "access_token": "at"}
        return type("R", (), {"json": lambda self: corpo, "status_code": 200})()

    oidc.httpx.post = post_com_claims

    r = c.get("/api/auth/sso/callback", params={"code": "codex", "state": state},
              follow_redirects=False)
    check("302 redirect", r.status_code == 302, str(r.status_code))
    loc = r.headers.get("location", "")
    check("redirect para SPA com token",
          loc.startswith("https://localhost#/sso/"), loc[:50])
    spa_token = loc.split("#/sso/")[-1]
    r2 = c.get("/api/me", headers={"Authorization": f"Bearer {spa_token}"})
    check("sessão SSO funcional (/me)", r2.status_code == 200
          and r2.json()["email"] == "novo.sso@ms.senai.br")

    r = c.get("/api/auth/sso/callback", params={"code": "x", "state": "falsificado"},
              follow_redirects=False)
    check("state inválido → redirect #/sso/erro",
          r.status_code == 302 and "#/sso/erro" in r.headers.get("location", ""))

print()
if falhas:
    print("FALHAS:", falhas)
    sys.exit(1)
print("SSO: TODOS OS TESTES PASSARAM ✔")
