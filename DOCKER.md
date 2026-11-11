# Stack Docker — Projeto Compras (sem dependências do Google)

Substitui a arquitetura GitHub Pages + Google Apps Script + Planilha + Drive
por containers autônomos. As regras de negócio foram portadas 1:1 dos
arquivos `.gs` — os "actions" (`ROTAS_API`) e o envelope `{ok, data, erro}`
são idênticos, então **as views do frontend não mudaram**.

## Arquitetura

```
                       ┌─ :80  (redirect)
[compras-proxy Caddy] ─┤
                       └─ :443 (TLS) ─► [compras-web nginx] ─► [compras-api FastAPI] ─► [volume compras-data]
                                          SPA (pasta frontend/)  /api/{acao}              /data/compras.db
                                          proxy /api/ ──────────┘  (fetch direto, sem Bridge)  /data/anexos/REQ-xxx/
```

| Antes (Google)                          | Agora                                     |
|-----------------------------------------|-------------------------------------------|
| Apps Script Web App (`Code.gs`)         | `backend/app/main.py` (`POST /api/{acao}`) |
| Bridge.html (iframe + postMessage)      | `fetch` direto — mesmo origem, sem hacks  |
| Planilha "Compras_DB" (5 abas)          | SQLite no volume (`backend/app/models.py`)|
| Drive "Compras Anexos"                  | Volume local `/data/anexos/`              |
| `LockService` (assunção atômica)        | `UPDATE` condicional com `rowcount`       |
| SHA-256(salt+senha)                     | bcrypt (hashes legados migram no 1º login)|
| `MailApp` (reset de senha)              | SMTP opcional (`SMTP_*`); sem SMTP, link no log |
| GitHub Pages                            | nginx no container `web` (atrás do Caddy) |

## Rodando

```bash
docker compose up -d --build     # sobe proxy (:80/:443), web e api
```

Acesse `https://localhost` (cert interno do Caddy; aceite o aviso ou instale
a CA local). Login inicial: `admin@ms.senai.br` / `admin123` (trocar no
1º login). Variáveis em `.env` (ver `.env.example`):

- `CADDY_DOMAIN=localhost` → TLS interno. Com um **domínio real** apontando
  para o host, ex.: `CADDY_DOMAIN=compras.suaempresa.com.br`, o Caddy emite
  certificado **Let's Encrypt** automaticamente (portas 80/443 públicas).
- `PORTA_HTTP` / `PORTA_HTTPS` — portas publicadas do proxy.

## Estrutura

```
backend/
├── Dockerfile                 python:3.12-slim + uvicorn
├── requirements.txt           fastapi, sqlalchemy, bcrypt, uvicorn
├── test_smoke.py              teste do fluxo completo (36 checks)
├── test_import.py             teste da migração CSV → SQLite (17 checks)
└── app/
    ├── main.py                roteador de ações (≈ Code.gs ROTAS_API)
    ├── config.py              settings por env (≈ Config.gs/Properties)
    ├── database.py            engine/sessão SQLAlchemy
    ├── models.py              6 tabelas (≈ abas da planilha)
    ├── security.py            bcrypt + sessões + tokens (≈ Utils.gs)
    ├── deps.py                permissões/grupos/histórico (≈ Utils.gs)
    ├── storage.py             anexos no volume (≈ Anexos.gs/Drive)
    ├── seed.py                conta ADMIN idempotente (≈ criarGestorInicial)
    ├── import_csv.py          migração CSV da planilha → SQLite
    ├── routers/
    │   ├── auth.py            login/cadastro/logout     (≈ Auth.gs)
    │   ├── pedidos.py         domínio central           (≈ Pedidos.gs)
    │   ├── anexos.py          anexar/listar/baixar      (≈ Anexos.gs)
    │   ├── usuarios.py        gestão de usuários        (≈ Usuarios.gs)
    │   ├── agregacoes.py      dashboard/performance/config
    │   └── reset.py           reset de senha via SMTP   (≈ Setup.gs)
└── data/                      (volume local p/ dev; ignorado pelo git)

frontend/                      cópia de docs/ com js/api.js reescrito (fetch)
                               e config.js com API_URL="" (mesma origem)

proxy/Caddyfile                TLS automático (Let's Encrypt ou interno)

docs/ + google-apps-script/    versão Google — mantida como legado/referência
```

## API — duas superfícies (Task 3)

**RESTful** (recomendada para novos clientes/integrações): Bearer token no
header `Authorization`, códigos HTTP corretos (400 regra, 401 sessão,
404 não achado), dados diretos sem envelope:

```
POST /api/auth/login | /auth/cadastro | /auth/logout | /auth/senha
POST /api/auth/reset/solicitar | /auth/reset/redefinir
GET  /api/me · /api/config · /api/responsaveis · /api/documentos
     /api/dashboard · /api/performance?de=&ate=&usuario=
GET  /api/pedidos?status=&modalidade=   POST /api/pedidos
GET  /api/pedidos/{numero}              DELETE /api/pedidos/{numero}
POST /api/pedidos/{numero}/enviar | /assumir | /designar | /tramitar
GET  /api/pedidos/{numero}/anexos       POST /api/pedidos/{numero}/anexos
GET  /api/anexos/{id}/arquivo           (binário, Content-Disposition)
GET  /api/usuarios    POST /api/usuarios
PATCH /api/usuarios/{email} ({grupo}|{ativo})   DELETE /api/usuarios/{email}
```

**Actions legados** (compatibilidade): `POST /api/{acao}` com
`{token, payload}` → envelope `{ok, data, erro}` — é o formato do Apps
Script; as views do frontend usam-no transparentemente via `API.chamar()`
(o `api.js` converte para REST por baixo). O Swagger do FastAPI documenta
ambas: `http://<host>/api/docs` aponta ao container `api` (expor a porta
8000 para acessar).

## Testes

```bash
# testes locais (sem Docker):
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt httpx
DATA_DIR=$(mktemp -d) .venv/bin/python test_smoke.py      # fluxo via actions (36)
DATA_DIR=$(mktemp -d) .venv/bin/python test_rest.py       # fluxo via REST (38)
DATA_DIR=$(mktemp -d) .venv/bin/python test_import.py     # migração CSV (17)

# teste do adapter do frontend contra o stack Docker rodando:
node test_frontend_adapter.mjs                            # fluxo completo (20)
```

## Migração de dados da planilha (implementada)

```bash
# 1) Na planilha "Compras_DB": Arquivo → Download → CSV para cada aba
#    (Usuarios.csv, Pedidos.csv, HistoricoStatus.csv, AnexosAudit.csv)
# 2) Opcional — arquivos de anexo: baixe a pasta "Compras Anexos" do Drive
# 3) Copie para o container e rode:
docker compose cp ./import compras-api:/data/import
docker compose exec api python -m app.import_csv /data/import \
       --anexos-dir /data/import/anexos
# Para apagar o banco atual e importar do zero: adicione --recriar
```

- Senhas legadas (SHA-256+salt do Apps Script) são preservadas e migram
  para bcrypt no 1º login de cada usuário;
- IDs de requisição (`REQ-xxxxxx`) e de anexo (`ANX-xxxxxx`) são mantidos;
- Anexos são casados por nome com os arquivos baixados do Drive (padrão
  `REQ-xxxxxx_<timestamp>_<nome>` usado pelo Apps Script, ou `drive_file_id`);
- Sem os arquivos do Drive, o download do anexo responde "Arquivo
  indisponível" — rode novamente com `--anexos-dir` e `--recriar`;
- O import é transacional: ou entra tudo, ou nada.

## Segurança

- Toda regra (perfil, transição, dono, domínio de e-mail, anexos) continua
  validada **no server** (`backend/`).
- Sessões: token de 8h na tabela `sessoes` (revogável); trocar senha
  invalida as demais sessões.
- O nginx limita `client_max_body_size 15m` e a API nunca fica exposta
  diretamente (rede interna do compose).
- TLS termina no Caddy (renovação automática); em produção defina
  `CADDY_DOMAIN` com domínio real, `ADMIN_SENHA_PADRAO` e `SMTP_*` no `.env`.
