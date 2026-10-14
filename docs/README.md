# Projeto Compras — versão hospedada (GitHub Pages + Google)

SPA estática (HTML/CSS/JS puro, mesmo visual do original) que consome uma API
implementada em **Google Apps Script Web App**, com dados na **Planilha
"Compras_DB"** e anexos no **Google Drive** (pasta "Compras Anexos", privada).

---

## 1. Arquitetura

```
[GitHub Pages — docs/]                        [Vocês (usuários)]
        │  fetch JSON (POST text/plain → sem CORS preflight)
        ▼
[Apps Script Web App — /google-apps-script/*]
        ├── Planilha "Compras_DB" (privada)
        │     abas: Usuarios · Pedidos · HistoricoStatus · AnexosAudit · Sessoes
        └── Drive: pasta "Compras Anexos"/REQ-XXXXXX (pública NÃO; acesso só pela API)
```

- **Executar como:** o dono da planilha (todos os acessos à planilha/Drive são mediados).
- **Acesso:** "Qualquer pessoa" (a própria API valida token de sessão e perfis).
- **Perfis** replicam o Django: `UserISI_IST`, `Time_Compras`, `Manager_Compras`
  (e `SuperUsuario` opcional = acesso total).
- **Senhas:** SHA-256(salt + senha) — nunca armazenadas em cleartext; a aba
  `Usuarios` nunca vai ao client completa.

## 2. Passo a passo de implantação

### 2.1 Planilha e pasta

1. Crie a planilha **"Compras_DB"** no Drive.
2. Extensões → **Apps Script** (projeto vinculado à planilha).
3. Cole os arquivos de `google-apps-script/` (um por arquivo):
   `Code.gs`, `Utils.gs`, `Auth.gs`, `Usuarios.gs`, `Pedidos.gs`, `Anexos.gs`,
   `Dashboard.gs`, `Performance.gs`, `Setup.gs` e, se for migrar dados,
   `migrarDados.gs`.
4. No editor, execute **uma** vez: `inicializar()` (cria as abas com cabeçalhos
   e a pasta de Drive "Compras Anexos").
5. Execute uma vez: `criarGestorInicial()` (cria `gestor@ms.senai.br` /
   `Gestor@2026` — **troque a senha depois**; ou cadastre o gestor pela tela).

### 2.2 Deploy do Web App

1. Apps Script → **Deploy → New deployment → tipo Web app**.
   - Execute as: **Me (email@...)**.
   - Who has access: **Anyone**.
2. Copie a URL terminada em `/exec`.

### 2.3 GitHub Pages

1. Suba este repositório no GitHub (a pasta `docs/` incluída).
2. **Settings → Pages → Deploy from a branch → branch `main` / pasta `docs`** → Save.
3. Em `docs/js/config.js`, preencha:
   ```js
   CONFIG.API_URL = "https://script.google.com/macros/s/<DEPLOY_ID>/exec";
   ```
4. Acesse `https://<usuario>.github.io/<repo>/` → tela de Entrar.

## 3. Migração de dados do Django (opcional)

1. No projeto Django, gere os CSVs:
   ```bash
   python exportar_migracao.py
   # → pasta migracao/ com Usuarios.csv, Pedidos.csv, HistoricoStatus.csv, AnexosAudit.csv
   ```
2. Suba os CSVs para uma pasta do Drive e a pasta `media/anexos` (com subpastas
   por pedido) para outra pasta.
3. Em `migrarDados.gs`, preencha `PASTA_CSV` e `PASTA_ANEXOS` com os IDs.
4. Rode, em ordem: `rodarMigracaoCompleta()` e depois `enviarAnexosAoDrive()`.
5. **Primeira senha de cada usuário:** `troque-a-senha@2026` (solicite a troca
   no 1º acesso ou via Gestão).

## 4. Funcionalidades replicadas (paridade com o Django)

| Recurso | Status |
|---|---|
| Login por e-mail institucional (@ms.senai.br) + senha hash | ✅ |
| Cadastro (auto-registro) com instituto/cargo/área/contato/ramal | ✅ |
| Nº de requisição automático `REQ-000001` | ✅ |
| Criar/Enviar/Excluir (só dono, só Aberta), Assumir, Designar (Gestão), Tramitar | ✅ |
| Concorrência na assunção (LockService + recheck) | ✅ |
| Documentação obrigatória; Cotação obrigatória se "Possui cotação? = Sim" | ✅ |
| Anexos: whitelist de extensão, 10 MB, download protegido, exclusão em cascata | ✅ |
| Histórico de status (auditoria) | ✅ |
| Lead time (envio → encerramento/hoje) | ✅ |
| Dashboard: cards, linha/mês, rosca/status, barras/instituto, ações rápidas | ✅ |
| Painel de Requisições: 10 colunas, filtros, ordenação, CSV | ✅ |
| Performance da Gestão (filtros, indicadores, tabela, gráficos, CSV) | ✅ |
| Configurações: dados + gestão de usuários (PROTECT na exclusão) | ✅ |
| Visual SENAI (azul #003876, laranja #E84910), sidebar por perfil | ✅ |

## 5. Segurança

- Toda regra (perfil, transição de status, dono do pedido, domínio do e-mail,
  tamanho/tipo de arquivo) é validada **no server** (Apps Script), nunca no
  client.
- Sessões com token de 8h + logout (aba `Sessoes`, limpeza de expiradas).
- Arquivos nunca expostos; download só via API (`baixarArquivo`), com verificação
  de permissão (403-equivalente).
- Em produção, considere: trocar a senha do gestor `Gestor@2026` e avaliar a
  migração para **Google Sign-In (OAuth)** — mais forte que senha + hash.

## 6. Limitações conhecidas

- `POST` simples (`text/plain`) — sem anexos diretos maiores que ~10 MB.
- Sheets segura milhões de linhas; se o histórico crescer muito, paginar server-side.
- Falta "Esqueci a senha" (v1): redefinir manualmente pela Gestão/planilha.
