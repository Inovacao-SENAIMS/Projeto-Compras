# Projeto Compras — versão hospedada (GitHub Pages + Google)

SPA estática (HTML/CSS/JS puro, mesmo visual do original) que consome uma API
implementada em **Google Apps Script Web App**, com dados na **Planilha
"Compras_DB"** e anexos no **Google Drive** (pasta "Compras Anexos", privada).

---

## 1. Arquitetura

```
[GitHub Pages — docs/]                        [Vocês (usuários)]
        │  iframe oculto + postMessage → google.script.run
        │  (o POST /exec não serve p/ browser: 302 converte POST em GET)
        ▼
[Apps Script Web App — Code.gs (roteia) + Bridge.html (ponte)]
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
   `Dashboard.gs`, `Performance.gs`, `Setup.gs` — **e o `Bridge.html` como
   arquivo do tipo HTML** (Arquivo → + → HTML, com o nome exato `Bridge`).
4. No editor, execute **uma** vez: `inicializar()` (cria as abas com cabeçalhos,
   a pasta de Drive "Compras Anexos" e registra a conta ADMIN). Rode novamente
   sempre que atualizar o código que adiciona abas novas (ex.: `ResetSenha`).
   - **Conceda a permissão de e-mail** quando solicitado: o fluxo "Esqueci minha
     senha" usa `MailApp` para enviar o link de redefinição.
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

## 3. Primeiros dados (fluxo de teste sugerido)

1. Como Grupo/Super: confirme que os **grupos** dos usuários estão corretos na
   aba `Usuarios` (auto-cadastro entra como `UserISI_IST`);
2. Usuários dos times adicionais: cadastre normalmente e, na planilha, mude a
   coluna `grupo` para `Time_Compras`/`Manager_Compras` (ou pelo /admin de
   Configurações com a Gestão);
3. Teste o fluxo completo: um solicitante registra uma requisição → a Gestão
   designa → o Time assume e tramita até a Concluída.

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
| Documentos (equipe): lista de todos os anexos com filtros, pré-visualização (popup) e download | ✅ |
| Performance da Gestão (filtros, indicadores, tabela, gráficos, CSV) | ✅ |
| Configurações: dados + gestão de usuários (PROTECT na exclusão) | ✅ |
| Conta ADMIN protegida (`gestor@ms.senai.br`): não pode ser excluída, inativada nem ter perfil alterado | ✅ |
| "Esqueci minha senha": e-mail com link de redefinição (validade 30 min, uso único) | ✅ |
| Visual SENAI (azul #003876, laranja #E84910), sidebar por perfil | ✅ |

## 5. Segurança

- Toda regra (perfil, transição de status, dono do pedido, domínio do e-mail,
  tamanho/tipo de arquivo) é validada **no server** (Apps Script), nunca no
  client.
- **Transporte**: `google.script.run` via iframe (Bridge.html) — não há
  fetch/cors; a planilha e o Drive ficam atingíveis apenas pela execução do
  Apps Script (do dono do web app).
- Sessões com token de 8h + logout (aba `Sessoes`, limpeza de expiradas).
- Arquivos nunca expostos; download só via API (`baixarArquivo`), com verificação
  de permissão (403-equivalente).
- Em produção, considere: trocar a senha do gestor `Gestor@2026` e avaliar a
  migração para **Google Sign-In (OAuth)** — mais forte que senha + hash.

## 6. Limitações conhecidas

- `POST` simples (`text/plain`) — sem anexos diretos maiores que ~10 MB.
- Sheets segura milhões de linhas; se o histórico crescer muito, paginar server-side.
- Falta "Esqueci a senha" (v1): redefinir manualmente pela Gestão/planilha.
