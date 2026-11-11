# Stack Docker — Projeto Compras (sem dependências do Google)

Substitui a arquitetura GitHub Pages + Google Apps Script + Planilha + Drive
por containers autônomos. As regras de negócio foram portadas 1:1 dos
arquivos `.gs` — os "actions" (`ROTAS_API`) e o envelope `{ok, data, erro}`
são idênticos, então **as views do frontend não mudaram**.

## Arquitetura

```
[compras-web  nginx:80] ──► [compras-api  FastAPI:8000] ──► [volume compras-data]
  SPA (pasta frontend/)        /api/{acao}                  /data/compras.db
  proxy /api/ ──────────────┘  (fetch direto, sem Bridge)   /data/anexos/REQ-xxx/
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
| GitHub Pages                            | nginx no container `web`                  |

## Rodando

```bash
docker compose up -d --build     # sobe web (:8080) e api
```

Acesse `http://localhost:8080`. Login inicial: `admin@ms.senai.br` /
`admin123` (trocar no 1º login). A porta é configurável em `.env` (ver
`.env.example`).

## Estrutura

```
backend/
├── Dockerfile                 python:3.12-slim + uvicorn
├── requirements.txt           fastapi, sqlalchemy, bcrypt, uvicorn
├── test_smoke.py              teste do fluxo completo (36 checks)
└── app/
    ├── main.py                roteador de ações (≈ Code.gs ROTAS_API)
    ├── config.py              settings por env (≈ Config.gs/Properties)
    ├── database.py            engine/sessão SQLAlchemy
    ├── models.py              6 tabelas (≈ abas da planilha)
    ├── security.py            bcrypt + sessões + tokens (≈ Utils.gs)
    ├── deps.py                permissões/grupos/histórico (≈ Utils.gs)
    ├── storage.py             anexos no volume (≈ Anexos.gs/Drive)
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

docs/ + google-apps-script/    versão Google — mantida como legado/referência
```

## Testes

```bash
# teste de fumaça local (sem Docker):
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt httpx
DATA_DIR=$(mktemp -d) .venv/bin/python test_smoke.py
```

## Migração de dados da planilha (opcional)

Não houve migração na v1 Google (dados de teste). Se houver dados reais na
planilha "Compras_DB" a portar, exporte cada aba como CSV e rode um script
de import (a criar em `backend/app/import_csv.py`) — o hash de senha legado
é reconhecido e atualizado para bcrypt no primeiro login de cada usuário.

## Segurança

- Toda regra (perfil, transição, dono, domínio de e-mail, anexos) continua
  validada **no server** (`backend/`).
- Sessões: token de 8h na tabela `sessoes` (revogável); trocar senha
  invalida as demais sessões.
- O nginx limita `client_max_body_size 15m` e a API nunca fica exposta
  diretamente (rede interna do compose).
- Em produção, defina `ADMIN_SENHA_PADRAO` e `SMTP_*` no `.env` e coloque
  TLS na frente (traefik/caddy ou proxy corporativo).
