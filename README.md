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

- **UserISI_IST (solicitante):** Home · Requisições · Configurações · Logout
- **Time_Compras:** Home · Requisições · Configurações · Logout
- **Manager_Compras:** Home · Requisições · Configurações · Logout
- **Painel ADM:** exibido apenas para usuários `is_staff` (link para `/admin/`)
- **Performance:** exibida apenas para a Gestão/SuperUsuário
- **Configurações:** dados do usuário e (Gestão/Superusuário) gestão de usuários.

### Identidade visual (SENAI)

O tema segue a paleta oficial do SENAI (`.design/brand`): **azul institucional**
`#003876` (primária), `#00529B` (secundária) e **laranja** `#E84910` (destaque).
Tipografia **Neo Sans Pro** com fallback para **Montserrat** (títulos) e **Mulish**
(texto). Raio de 12px, sombras suaves, e o logo **SENAI | Sistema FIEMS** na
sidebar e nas telas de login/cadastro. As cores dos gráficos usam a paleta da marca.

### Home / Dashboard

A Home (`/`) exibe um **dashboard** inspirado no design de referência
(`.design/dashboard`):

- **Cards de números**: Total, Pendentes, Concluídas e Canceladas;
- **Requisições por Mês** (gráfico de linha — Chart.js);
- **Requisições por Status** (rosca) + lista de números por status;
- **Requisições por Instituto** — gráfico de barras usando o **instituto do
  solicitante** (definido no cadastro);
- **Ações Rápidas** (atalhos conforme o perfil).

Os dados seguem o perfil: o **solicitante** vê as próprias requisições; o **Time**
e a **Gestão** veem todas.

### Cadastro de usuário (auto-registro)

Na tela de entrada (`/entrar/`) há o link **"Cadastre-se"** (`/cadastro/`), com um
formulário que solicita: **Nome completo**, **E-mail institucional** (aceito
apenas com domínio **@ms.senai.br**), **Área de atuação**, **Cargo**,
**Instituto** (IST Alimentos e Bebidas - Dourados · ISI Biomassa - Três Lagoas ·
IST Eficiência Operacional - Campo Grande), **Contato (telefone)**, **Ramal**,
**Senha** e **Confirmar senha**.

O usuário criado entra como **UserISI_IST** (usuário comum/solicitante), já ativo,
e faz login pelo **e-mail** (usado como usuário). O **Instituto** fica associado ao
usuário (modelo `Perfil`, em `accounts`) e alimenta o gráfico "Requisições por
Instituto" do dashboard.

### Configurações (por perfil)

- **Usuário comum (`UserISI_IST`):** exibe os dados informados no cadastro — nome,
  e-mail, área de atuação, cargo, instituto, contato e ramal.
- **Gestão (`Manager_Compras`):** seus dados + a **lista dos membros do Time de
  Compras**, podendo **ativar, inativar e excluir** usuários.
- **SuperUsuário/ADM:** seus dados + a **lista de todos os usuários**, podendo
  **ativar, inativar e excluir**.

Regras: ninguém gerencia a si mesmo; a Gestão gerencia apenas membros do Time de
Compras; a exclusão é bloqueada quando o usuário possui requisições vinculadas.

### Performance do Time (Gestão/SuperUsuário)

Página exclusiva da **Gestão/SuperUsuário** (`/compras/performance/`,
decorator `gestor_required`) para acompanhar a performance do Time de Compras:

- **Filtros**: por **período** (De/Até, sobre a data de abertura) e por
  **usuário** (membro do Time);
- **Indicadores** (em uma única linha): no período, sem responsável, em análise,
  concluídas, canceladas;
- **Tabela por membro** do Time: total atribuídas, em análise, concluídas,
  canceladas e **lead time médio**;
- **Gráficos** (Chart.js): requisições por **status** e atribuídas **por membro**;
- **Exportar CSV** do relatório (respeitando os filtros), pronto para o Excel.

### Requisições (solicitante)

Página única (`/requisicoes/`, view `painel`) onde o solicitante:

- clica em **"+ Nova Requisição"**, que abre um **modal (popup)** de registro;
- o modal contém: **Nome do Produto**, **Descrição do Objeto** (detalhes do item
  ou serviço), **Quantidade**, **Modalidade RCA (obrigatória)**, **Urgência**,
  **Possui cotação? (Sim/Não)** e **Documentação (anexo) — obrigatória e sempre
  visível**. Se marcar **Sim** em "Possui cotação?", surge um **segundo campo,
  "Cotação (anexo)"**, também obrigatório; botão **Registrar**. O nome do
  solicitante é preenchido automaticamente com o usuário logado;
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
- **Data de Abertura:** data/hora de criação (`criado_em`) — `dd/mm/aaaa - HH:MM`.
- **Data de Envio:** data/hora em que o solicitante clica em **Enviar**.
- **Status:** Aberta · Enviada · Em Análise · Concluída · Cancelada.
- **Data de Encerramento:** preenchida ao concluir/cancelar.
- **Lead Time:** sem Data de Envio → vazio; com Envio e Encerramento →
  Encerramento − Envio; com Envio e sem Encerramento → Hoje − Envio.
- **Ações:** botões com **Bootstrap Icons** (via CDN) — **Enviar**, **Anexos**
  (popup), **Excluir** e **Ver Detalhes** (no solicitante); na equipe, **Assumir**,
  **Designar** / **Alterar Responsável** (popup, apenas Gestão — basta clicar no
  usuário), **Tramitar**, **Anexos** e **Ver Detalhes**.
- **Designar/Alterar Responsável:** ao clicar no usuário, o sistema pede
  **confirmação**; após confirmar, exibe a **mensagem de sucesso** e retorna à
  **lista de requisições**.
- **Tramitar:** abre uma página com **um único container** exibindo **todas as
  informações** da requisição (detalhes, anexos e histórico) e um botão **Editar**.
  Ao clicar em Editar, ficam disponíveis **Status**, **Observação** e o campo de
  **anexo** (o **Retorno final** aparece quando o status for *Concluída*). O botão
  **Voltar** retorna à **lista de requisições**.

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
  permitido e tamanho máximo de **10 MB**. No registro de nova requisição a
  **Documentação** é **obrigatória** (campo sempre visível); a **Cotação** é
  obrigatória quando "Possui cotação? = Sim". Cada anexo tem um **tipo**
  (Documentação/Cotação), exibido no popup de anexos.
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
python manage.py criar_equipe --grupo Manager_Compras --usuario gestor@ms.senai.br:Gestor@2026

# 6. (Opcional) Dados de exemplo para testar/visualizar
python manage.py seed --reset

# 7. Executar o servidor
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
# compras1@ms.senai.br ... compras4@ms.senai.br -> grupo "Time_Compras"

# Gestor de compras
python manage.py criar_equipe --grupo Manager_Compras --usuario gestor@ms.senai.br:Gestor@2026

# Usuário comum (solicitante)
python manage.py criar_equipe --grupo UserISI_IST --usuario ana@ms.senai.br:Ana@2026
```

> **Login pelo e-mail:** o e-mail institucional é usado como *usuário*; o login é
> feito por ele (ex.: `ana@ms.senai.br`).

> **Exibição do usuário:** nas telas o usuário aparece pelo **nome** (nome
> completo → primeiro nome → login sem o domínio), nunca pelo e-mail — sidebar,
> coluna Responsável, histórico, anexos e designação.

Novos usuários **não exigem alteração de código**. Também é possível gerenciar
pelo `/admin`: crie o usuário e adicione-o ao grupo correspondente
(`UserISI_IST`, `Time_Compras` ou `Manager_Compras`).

Sugestão para testar rapidamente: entre como `ana@ms.senai.br` (solicitante) e
registre uma requisição; como `gestor@ms.senai.br`, **designe** a requisição a um
usuário do time; e como `compras1@ms.senai.br` (Time de Compras), assuma e tramite
até a conclusão.

> Em produção, troque a `SECRET_KEY`, desative `DEBUG` e defina
> `ALLOWED_HOSTS`. Os anexos continuam sem exposição pública graças ao download
> mediado por view.

## 8. Dados de exemplo (seed)

O comando `seed` popula o banco com **usuários** (equipe, gestor e solicitantes com
perfil/instituto) e **requisições** variadas (status, meses, responsáveis, anexos e
histórico), para visualizar o dashboard, a performance e as tabelas com dados.

```powershell
python manage.py seed             # gera 80 requisições
python manage.py seed --pedidos 200
python manage.py seed --reset     # apaga as requisições antes de gerar
```

Ao final, o comando imprime o **resumo por status**, as **rotas** para conferir e as
**credenciais** de acesso.
