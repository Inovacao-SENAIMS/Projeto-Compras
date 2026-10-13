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

- **Solicitante:** Home · Painel de Requisições · Configurações · Logout
- **Equipe de compras:** Home · Painel de Compras (Equipe) · Configurações · Logout
- **Painel ADM:** exibido apenas para usuários `is_staff` (link para `/admin/`)
- **Configurações:** página placeholder (visível a todo usuário autenticado)

### Painel de Requisições (solicitante)

Página única (`/requisicoes/`, view `painel`) onde o solicitante:

- clica em **"+ Nova Requisição"**, que abre um **modal (popup)** de registro;
- o modal contém: **Nome do Produto**, **Urgência**, **Possui cotação? (Sim/Não)**
  e, quando a resposta é **Sim**, o campo de **anexo** passa a ser exibido;
  botão **Registrar**. O nome do solicitante é preenchido automaticamente com o
  usuário logado;
- **consulta** a lista das próprias requisições (status, responsável, datas);
- **exclui** as requisições que lançou, **desde que ainda não tenham sido
  assumidas** (status "Novo" e sem responsável). Após a assunção pela equipe, a
  exclusão é bloqueada para preservar o histórico. Ao excluir, os arquivos dos
  anexos também são removidos do disco.

Se houver erro de validação no envio, o modal reabre automaticamente com as
mensagens.

### Tabela principal (colunas)

As tabelas do solicitante ("Minhas requisições") e da equipe ("Painel de Compras
(Equipe)") usam a seguinte estrutura:

Nº da Requisição · Responsável · Aquisição · Modalidade (RCA) · Data de Abertura ·
Status do Processo · Data de Envio · Data do Encerramento · Lead Time (Dias) ·
Anexo · Ações

- **Nº da Requisição:** texto único gerado automaticamente (`REQ-000001`).
- **Aquisição:** o campo `produto` da requisição.
- **Modalidade (RCA):** preenchida pela equipe na **tramitação** (lista
  *provisória* — a ser substituída pelo Regulamento RCA SENAI).
- **Data de Abertura:** data de criação (`criado_em`).
- **Data de Envio / Data do Encerramento:** preenchidas na tramitação / ao concluir.
- **Anexo:** link para o PDF via download protegido.
- **Lead Time (Dias) — regra:** sem Data de Envio → vazio; com Envio e
  Encerramento → Encerramento − Envio; com Envio e sem Encerramento → Hoje − Envio.

> Observação: as colunas "Urgência" e "Solicitante" não fazem parte deste layout
> (seguem registradas e visíveis na tela de detalhe da requisição).

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

O perfil é derivado do grupo do Django **`Equipe de Compras`**:

- está no grupo (ou é superusuário) → **equipe de compras**;
- qualquer outro usuário autenticado → **solicitante**.

| Ação | Solicitante | Equipe (não responsável) | Responsável |
|---|:--:|:--:|:--:|
| Criar pedido + anexar | ✅ (só os seus) | ❌ | ❌ |
| Listar/ver pedidos | só os próprios | todos | todos |
| Baixar anexo | só de pedido próprio | todos | todos |
| Assumir pedido novo | ❌ | ✅ | — |
| Alterar status / tramitar | ❌ | ❌ (leitura) | ✅ (só o seu) |
| Registrar/ver retorno final | ver só dos próprios | ver todos | registrar |

Aplicado via decorators `solicitante_required` / `equipe_required`
(`accounts/decorators.py`) e verificações em `pedidos/permissoes.py`.

## 4. Fluxo de status

```
novo ──(assumir)──▶ em_cotacao ──▶ aguardando_aprovacao ──▶ aprovado ──▶ concluido
                          └──────────────┴──────────────────────┴──▶ cancelado
```

- `novo → em_cotacao` ocorre **automaticamente** ao assumir (não é editável).
- As demais transições são feitas **apenas pelo responsável**, via tela
  "Tramitar".
- `retorno_final` é **obrigatório** para concluir.
- `concluido` e `cancelado` são terminais.

**Concorrência na assunção:** `services.assumir_pedido` faz um `UPDATE`
condicional (`WHERE responsavel IS NULL AND status = 'novo'`) dentro de uma
transação. Se dois membros clicarem ao mesmo tempo, apenas um afeta a linha — o
outro recebe a mensagem "Este pedido já foi assumido por outro membro".

## 5. Anexos (segurança)

- Armazenados em `MEDIA_ROOT` com nome **uuid** (sem path traversal, sem
  colisão). `MEDIA_URL` **não** é roteada em `urls.py`.
- **Validação** (`pedidos/validators.py`): extensão em lista branca, tipo MIME
  permitido e tamanho máximo de **10 MB**.
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

# 5. Usuários da equipe de compras (os 4 iniciais)
python manage.py criar_equipe

# 6. Executar o servidor
python manage.py runserver
```

Acesse http://127.0.0.1:8000/ — a home redireciona conforme o perfil.
O admin fica em http://127.0.0.1:8000/admin/.

## 7. Usuários da equipe e solicitantes

Os **4 usuários iniciais da equipe** são criados por um único comando, a partir
da lista `EQUIPE_INICIAL` em `compras/settings.py` (senha padrão `Compras@2026`):

```powershell
python manage.py criar_equipe
# compras1, compras2, compras3, compras4 -> grupo "Equipe de Compras"
```

O comando é **idempotente** (cria se não existir, atualiza o grupo se já existir).

**Adicionar novos membros da equipe — sem alterar código:**

```powershell
# via comando
python manage.py criar_equipe --usuario maria:Senha@123:maria@exemplo.com

# ou pelo /admin: crie o usuário e adicione-o ao grupo "Equipe de Compras"
```

**Criar solicitantes** (papel padrão — basta o usuário existir com senha):

```powershell
python manage.py criar_equipe --grupo Solicitante --usuario ana:Ana@2026:ana@exemplo.com
```

Sugestão para testar rapidamente: crie um solicitante como acima, faça login,
crie um pedido com anexo; depois entre como `compras1` (senha `Compras@2026`),
assuma o pedido e tramite até a conclusão.

> Em produção, troque a `SECRET_KEY`, desative `DEBUG` e defina
> `ALLOWED_HOSTS`. Os anexos continuam sem exposição pública graças ao download
> mediado por view.
