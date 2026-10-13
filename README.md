# Projeto Compras — Gestão de Pedidos de Compra

Aplicação Django para registrar e tramitar pedidos de compra, com duas áreas
autenticadas: **solicitante** e **equipe de compras**.

- **Solicitante:** cria pedidos (produto, nome do solicitante, urgência) com
  anexos e acompanha apenas os próprios pedidos e o retorno final.
- **Equipe de compras:** vê todos os pedidos, assume um pedido e conduz a
  tramitação (status + retorno final + histórico).

---

## 1. Estrutura do projeto

```
compras/                  # configuração do projeto (settings, urls, wsgi/asgi)
core/                     # home "/" que redireciona por perfil
accounts/                 # perfis (grupos), decorators e comando criar_equipe
pedidos/                  # domínio: Pedido, Anexo, HistoricoStatus (views/forms/services)
templates/                # base, login e templates das duas áreas
static/css/style.css      # estilo
media/anexos/             # anexos enviados (NÃO servidos publicamente)
```

Dentro de `pedidos/`, a lógica de negócio fica em `services.py`, as regras de
permissão em `permissoes.py` e a validação de upload em `validators.py`, mantendo
as views enxutas.

### Navegação (sidebar)

Todas as telas usam um layout com sidebar sensível ao perfil:

- **UserISI_IST (solicitante):** Home · Painel de Requisições · Configurações · Logout
- **Time_Compras:** Home · Painel de Compras (Equipe) · Configurações · Logout
- **Manager_Compras:** Home · Painel de Compras (Gestão) · Configurações · Logout
- **Painel ADM:** exibido apenas para usuários `is_staff` (link para `/admin/`)
- **Configurações:** página placeholder (visível a todo usuário autenticado)

### Painel de Requisições (solicitante)

Página única (`/requisicoes/`, view `painel`) onde o solicitante:

- clica em **"+ Nova Requisição"**, que abre um **modal (popup)** de registro;
- o modal contém: **Nome do Produto**, **Descrição do Objeto** (detalhes do item
  ou serviço), **Quantidade**, **Modalidade RCA (obrigatória)**, **Urgência**,
  **Possui cotação? (Sim/Não)** e **Documentação (anexo) — obrigatória e sempre
  visível**; botão **Registrar**. O nome do solicitante é preenchido
  automaticamente com o usuário logado;
- **consulta** a lista das próprias requisições (status, responsável, datas);
- **exclui** as requisições que lançou, **desde que ainda não tenham sido
  assumidas** (status "Novo" e sem responsável). Após a assunção pela equipe, a
  exclusão é bloqueada para preservar o histórico. Ao excluir, os arquivos dos
  anexos também são removidos do disco.

Se houver erro de validação no envio, o modal reabre automaticamente com as
mensagens.

### Tabela principal (colunas)

As tabelas do solicitante ("Painel de Requisições") e da equipe ("Painel de
Compras") usam a seguinte estrutura:

Nº da Requisição · Responsável · Item · Modalidade (RCA) · Data de Abertura ·
Data de Envio · Status · Data de Encerramento · Lead Time · Ações

- **Nº da Requisição:** texto único gerado automaticamente (`REQ-000001`).
- **Item:** o campo `produto` da requisição.
- **Modalidade (RCA):** escolhida pelo solicitante no **registro** (Regulamento RCA
  SENAI): Seleção com Disputa (Aberta/Fechada), Seleção sem Disputa
  (Dispensa/Inexigibilidade), Credenciamento, Pré-qualificação, Diálogo Prévio e
  Registro de Preço.
- **Data de Abertura:** data de criação (`criado_em`).
- **Data de Envio:** gravada quando o solicitante clica em **Enviar**.
- **Status:** Aberta · Enviada · Em Análise · Concluída · Cancelada.
- **Data de Encerramento:** preenchida ao concluir/cancelar.
- **Lead Time:** sem Data de Envio → vazio; com Envio e Encerramento →
  Encerramento − Envio; com Envio e sem Encerramento → Hoje − Envio.
- **Ações:** botões com **Bootstrap Icons** (via CDN) — **Enviar**, **Anexos**
  (popup), **Excluir** e **Ver Detalhes** (no solicitante); na equipe, **Assumir**,
  **Designar** (popup, apenas Gestão), **Tramitar**, **Anexos** e **Ver Detalhes**.

Layout: tabela sem quebra de linha (`nowrap`), com rolagem horizontal quando
necessário, e **20px** de espaçamento entre a tabela, a sidebar e as bordas.

## 2. Decisões de modelagem

- **`Pedido`** guarda `produto`, `solicitante_nome`, `urgencia`, `status`,
  `responsavel` (nulo até ser assumido) e `retorno_final`, além das datas
  (`criado_em`, `atualizado_em`, `assumido_em`, `concluido_em`).
- **`criado_por` (FK) + `solicitante_nome` (texto):** o primeiro é o dono do
  pedido (base da visibilidade "só os meus"); o segundo é o nome informado no
  formulário, que pode diferir do login.
- **`Anexo`** aponta para o pedido, guarda o arquivo com nome aleatório (uuid)
  no disco e preserva o `nome_original` para exibição/download.
- **`HistoricoStatus`** registra cada mudança (de → para, quem, quando,
  observação) — a trilha de auditoria do fluxo.
- `on_delete=PROTECT` em `criado_por` e `responsavel` evita apagar usuários com
  pedidos vinculados.

## 3. Perfis e permissões

Os perfis são definidos por grupos do Django (`accounts/grupos.py`):

| Grupo | Papel | Atividades |
|---|---|---|
| `UserISI_IST` | Usuário comum (solicitante) | Registrar requisições, ver as próprias e acompanhar o andamento |
| `Time_Compras` | Time de compras | Ver as requisições atribuídas a si e **decidir** (tramitar) |
| `Manager_Compras` | Gestão | **Designar/redesignar** o responsável, acompanhar prazos/andamento e **também tramitar** |
| SuperUsuário/ADM | `is_superuser` | Acesso total (tratado como todos os perfis) |

| Ação | UserISI_IST | Time_Compras | Manager_Compras |
|---|:--:|:--:|:--:|
| Criar requisição + anexar | ✅ (só as suas) | ❌ | ❌ |
| Enviar/excluir requisição "Aberta" | ✅ (só as suas) | ❌ | ❌ |
| Ver requisições | só as próprias | todas | todas |
| Baixar anexo | só do próprio pedido | todos | todos |
| Assumir requisição enviada | ❌ | ✅ | ✅ |
| Designar/redesignar responsável | ❌ | ❌ | ✅ |
| Tramitar (Em Análise → Concluída/Cancelada) | ❌ | só as que assumiu | qualquer uma (não final) |

Aplicado via decorators `solicitante_required` / `equipe_required`
(`accounts/decorators.py`) e verificações em `pedidos/permissoes.py`.

## 4. Fluxo de status

```
aberta ──(Enviar)──▶ enviada ──(Assumir/Designar)──▶ em_analise ──▶ concluida
                                                                 └──▶ cancelada
```

- **aberta**: criada pelo solicitante (grava a **Data de Abertura**). Só o dono
  pode **Enviar** ou **Excluir**.
- **Enviar** (solicitante) → **enviada** e grava a **Data de Envio**.
- **enviada → em_analise**: a equipe **Assume** (Time) ou a **Gestão Designa**.
- **em_analise → concluida/cancelada**: responsável (Time) ou Gestão, via "Tramitar".
- `retorno_final` é **obrigatório** para concluir.
- `concluida` e `cancelada` são terminais e gravam a **Data de Encerramento**.

**Concorrência na assunção:** `services.assumir_pedido` faz um `UPDATE`
condicional (`WHERE responsavel IS NULL AND status = 'novo'`) dentro de uma
transação. Se dois membros clicarem ao mesmo tempo, apenas um afeta a linha — o
outro recebe a mensagem "Este pedido já foi assumido por outro membro".

## 5. Anexos (segurança)

- Armazenados em `MEDIA_ROOT` com nome **uuid** (sem path traversal, sem
  colisão). `MEDIA_URL` **não** é roteada em `urls.py`.
- **Validação** (`pedidos/validators.py`): extensão em lista branca, tipo MIME
  permitido e tamanho máximo de **10 MB**. No registro de nova requisição o
  anexo (**Documentação**) é **obrigatório** e o campo fica sempre visível.
- **Download protegido:** view `anexo_download` (`/anexos/<id>/`) confere a
  permissão sobre o pedido antes de devolver o arquivo. Sem permissão → `403`.

---

## 6. Como executar localmente

Pré-requisito: Python 3.10+ instalado.

```powershell
# 1. Ambiente virtual
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Linux/macOS: source .venv/bin/activate

# 2. Dependências
pip install -r requirements.txt     # Django==6.1.2

# 3. Banco de dados
python manage.py migrate

# 4. Superusuário (para o /admin) — pede usuário e senha
python manage.py createsuperuser

# 5. Usuários iniciais: Time de Compras + Gestor
python manage.py criar_equipe
python manage.py criar_equipe --grupo Manager_Compras --usuario gestor:Gestor@2026:gestor@exemplo.com

# 6. Executar o servidor
python manage.py runserver
```

Acesse http://127.0.0.1:8000/ — a home redireciona conforme o perfil.
O admin fica em http://127.0.0.1:8000/admin/.

## 7. Grupos e usuários

Os grupos de perfil são criados pela migração `accounts.0001_migrar_grupos`, que
também **migra os grupos antigos**: "Equipe de Compras" → `Time_Compras` e
"Solicitante" → `UserISI_IST`.

O comando `criar_equipe` cria/atualiza usuários e os vincula a um grupo
(idempotente). O padrão é o **Time de Compras**, a partir de `EQUIPE_INICIAL`
em `compras/settings.py` (senha `Compras@2026`):

```powershell
# Time de Compras (padrão)
python manage.py criar_equipe
# compras1, compras2, compras3, compras4 -> grupo "Time_Compras"

# Gestor de compras
python manage.py criar_equipe --grupo Manager_Compras --usuario gestor:Gestor@2026:gestor@exemplo.com

# Usuário comum (solicitante)
python manage.py criar_equipe --grupo UserISI_IST --usuario ana:Ana@2026:ana@exemplo.com
```

Novos usuários **não exigem alteração de código**. Também é possível gerenciar
pelo `/admin`: crie o usuário e adicione-o ao grupo correspondente
(`UserISI_IST`, `Time_Compras` ou `Manager_Compras`).

Sugestão para testar rapidamente: entre como `ana` (solicitante) e registre uma
requisição; como `gestor`, **designe** a requisição a um usuário do time; e como
`compras1` (Time de Compras), assuma e tramite até a conclusão.

> Em produção, troque a `SECRET_KEY`, desative `DEBUG` e defina
> `ALLOWED_HOSTS`. Os anexos continuam sem exposição pública graças ao download
> mediado por view.
