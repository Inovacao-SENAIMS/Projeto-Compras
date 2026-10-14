# Projeto Compras — Gestão de Requisições de Compra

Aplicação para registrar e tramitar requisições de compra, hospedada no
**GitHub Pages**, com API em **Google Apps Script**, dados na **Planilha
"Compras_DB"** e anexos no **Google Drive** (pasta privada "Compras Anexos").

> Este projeto **substituiu** a versão anterior em Django (que roda apenas
> localmente e não faz parte deste repositório).

---

## 1. Estrutura do repositório

```
docs/                    # SPA estática (servida pelo GitHub Pages)
├── index.html           # casca única + rotas (#/login, #/home, ...)
├── css/style.css        # visual SENAI (azul #003876, laranja #E84910)
├── js/                  # config, sessão, api, roteador, ui e as views
└── README.md            # GUIA COMPLETO DE IMPLANTAÇÃO (planilha, deploy, uso)

google-apps-script/      # código da API (colar num projeto Apps Script
                         # vinculado à planilha "Compras_DB")
├── Code.gs              # roteador das ações (POST {action, token, payload})
├── Utils.gs             # acesso às abas, sessões, senhas (SHA-256+salt), LockService
├── Auth.gs · Usuarios.gs
├── Pedidos.gs           # criar/enviar/assumir/designar/tramitar/excluir
├── Anexos.gs            # valida e grava anexos no Drive (10 MB, whitelist)
├── Dashboard.gs · Performance.gs
└── Setup.gs             # inicializar() + criarGestorInicial()
```

O banco antigo (Django/SQLite) continha apenas **dados de teste** — nada foi
migrado; o sistema parte **limpo** (usuários reais se auto-cadastram).

## 2. Fluxo de status

```
Aberta ──(Enviar)──▶ Enviada ──(Assumir/Designar)──▶ Em Análise ──▶ Concluída
                                                                 └──▶ Cancelada
```

- Nº da requisição gerado automaticamente (`REQ-000001`);
- **Retorno final** obrigatório ao concluir; Data de Encerramento nos status
  terminais; lead time calculado (Envio → Encerramento, ou hoje, se aberta);
- Assunção atômica (`LockService` + recheck) — só um membro assume;
- Documentação (anexo) obrigatória no registro; Cotação obrigatória quando
  "Possui cotação? = Sim".

## 3. Perfis (grupos)

| Grupo | Papel |
|---|---|
| `UserISI_IST` | Solicitante — registra, envia, exclui (próprias, Abertas) e acompanha |
| `Time_Compras` | Team de compras — assume e tramita |
| `Manager_Compras` | Gestão — designa/redesigna, tramita, Performance e gestão de usuários |
| `SuperUsuario` | Acesso total |

Regras: ninguém gerencia a si mesmo; a Gestão gerencia só o Time de Compras;
exclusão de usuário bloqueada se houver requisições vinculadas.

## 4. Implantação e uso

Todas as etapas (criar a planilha, colar os `.gs`, `inicializar()`, executar
`criarGestorInicial()`, subir o deploy do Web App e ativar o Pages para a
pasta `docs/`) estão no guia:

**[`docs/README.md`](docs/README.md)**

Acesso inicial da Gestão: `admin@ms.senai.br` / `admin123` — trocar a senha no 1º login.
