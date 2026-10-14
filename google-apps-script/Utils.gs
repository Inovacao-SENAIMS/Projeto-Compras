/**
 * Utils.gs — acesso às abas, estrutura de dados e helpers.

 * Layout da planilha "Compras_DB":
 *
 *  Usuarios:     nome_completo | email | grupo | senha_hash | salt | area_atuacao
 *                | cargo | instituto | telefone | ramal | ativo
 *  Pedidos:      numero | produto | descricao_objeto | quantidade | modalidade
 *                | urgencia | possui_cotacao | solicitante_nome | criado_por
 *                | data_envio | status | responsavel | retorno_final
 *                | criado_em | atualizado_em | assumido_em | concluido_em
 *  HistoricoStatus: numero_req | de | para | usuario | observacao | criado_em
 *  AnexosAudit:  id | numero_req | tipo | nome_original | drive_file_id
 *                | enviado_por | enviado_em
 *  Sessoes:      token | email | expira_em
 */

const STATUS = {
  ABERTA: "aberta",
  ENVIADA: "enviada",
  EM_ANALISE: "em_analise",
  CONCLUIDA: "concluida",
  CANCELADA: "cancelada",
};

const STATUS_TERMINAIS = [STATUS.CONCLUIDA, STATUS.CANCELADA];

/* Transições — igual ao Django (pedidos.models.TRANSICOES) */
const TRANSICOES = {
  [STATUS.ABERTA]: [],
  [STATUS.ENVIADA]: [],
  [STATUS.EM_ANALISE]: [STATUS.CONCLUIDA, STATUS.CANCELADA],
  [STATUS.CONCLUIDA]: [],
  [STATUS.CANCELADA]: [],
};

const GRUPOS = {
  SOLICITANTE: "UserISI_IST",
  TIME: "Time_Compras",
  MANAGER: "Manager_Compras",
  SUPER: "SuperUsuario", // opcional: acesso total
};

const CHAVE_PASTA_RAIZ = "pasta_raiz_anexos_id";
const CHAVE_ANEXO_ID = "anexo_seq";

/* --------------------------- acesso às abas --------------------------- */

function ss() {
  return SpreadsheetApp.getActiveSpreadsheet(); // projeto vinculado à planilha
}

function aba(nome) {
  const sh = ss().getSheetByName(nome);
  if (!sh) throw new Error("Aba não encontrada: " + nome + ". Execute a função inicializar primeiro.");
  return sh;
}

/** Todas as linhas da aba como objetos {coluna: valor}. A 1ª linha é cabeçalho. */
function lerAba(nome) {
  const sh = aba(nome);
  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return [];
  const cab = dados[0].map((h) => String(h).trim());
  return dados.slice(1).map((linha) => {
    const o = {};
    cab.forEach((h, i) => { o[h] = linha[i]; });
    return o;
  });
}

/** Linhas filtradas com índice (2-based) para edição/remoção. */
function lerAbaComLinha(nome) {
  const sh = aba(nome);
  const dados = sh.getDataRange().getValues();
  if (dados.length <= 1) return [];
  const cab = dados[0].map((h) => String(h).trim());
  const out = [];
  for (let i = 1; i < dados.length; i++) {
    const o = {};
    cab.forEach((h, j) => { o[h] = dados[i][j]; });
    o.__linha__ = i + 1;
    out.push(o);
  }
  return out;
}

function inserirLinha(nome, valores) {
  aba(nome).appendRow(valores);
}

function removerLinha(nome, linha) {
  aba(nome).deleteRow(linha);
}

/* --------------------------- administração/permissões --------------------------- */

/** E-mail da conta ADMIN do sistema (não pode ser excluída/alterada).
 * Configurável pela propriedade de script ADMIN_EMAIL (padrão abaixo). */
const ADMIN_EMAIL_PADRAO = "admin@ms.senai.br";
const ADMIN_SENHA_PADRAO = "admin123";

function emailAdmin() {
  const prop = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL");
  return String(prop || ADMIN_EMAIL_PADRAO).toLowerCase();
}

function ehAdmin(email) {
  return String(email || "").trim().toLowerCase() === emailAdmin();
}

/** Garante que a conta alvo não é a administrativa. */
function exigirNaoAdmin(email, acao) {
  exigir(!ehAdmin(email),
    "A conta administrativa do sistema (" + emailAdmin() + ") não pode ser " + acao + ".");
}

/** Aba por nome, criando-a com o cabeçalho informado se ainda não existir. */
function abaOuCriar(nome, cabecalho) {
  const sh = ss().getSheetByName(nome);
  if (sh) return sh;
  const novo = ss().insertSheet(nome);
  if (cabecalho && cabecalho.length) novo.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  novo.setFrozenRows(1);
  return novo;
}

/* --------------------------- ações de usuário --------------------------- */

function buscarUsuario(email) {
  const em = String(email || "").trim().toLowerCase();
  return lerAba("Usuarios").find((u) => String(u.email).toLowerCase() === em) || null;
}

function buscarUsuarioPorLinha(email) {
  const em = String(email || "").trim().toLowerCase();
  return lerAbaComLinha("Usuarios").find((u) => String(u.email).toLowerCase() === em) || null;
}

function isSuper(usuario) {
  return usuario.grupo === GRUPOS.SUPER;
}
function isManager(usuario) {
  return usuario.grupo === GRUPOS.MANAGER || isSuper(usuario);
}
function isEquipe(usuario) {
  return usuario.grupo === GRUPOS.TIME || isManager(usuario);
}
function isValido(usuario) {
  return usuario && String(usuario.ativo).toString().toUpperCase() !== "FALSE";
}

/** Nome de exibição (igual ao Django): nome completo → primeiro nome → email sem domínio. */
function nomeExibicao(email, nomeCompleto) {
  if (nomeCompleto) return nomeCompleto;
  const u = buscarUsuario(email);
  if (u && u.nome_completo) return u.nome_completo;
  return String(email || "").split("@")[0];
}

/* --------------------------- sessões --------------------------- */

function validarSessao(token) {
  if (!token) return null;
  const agora = Date.now();
  const sessao = lerAba("Sessoes").find(
    (s) => String(s.token) === String(token) && new Date(s.expira_em).getTime() > agora
  );
  if (!sessao) return null;
  const u = buscarUsuario(sessao.email);
  if (!u || !isValido(u)) return null;
  return u;
}

function criarSessao(usuario) {
  const token = Utilities.getUuid();
  const expira = new Date(Date.now() + 8 * 60 * 60 * 1000);
  inserirLinha("Sessoes", [token, String(usuario.email).toLowerCase(), expira]);
  limparSessoesExpiradas();
  return token;
}

function encerrarSessao(token) {
  const s = lerAbaComLinha("Sessoes").find((x) => String(x.token) === String(token));
  if (s) removerLinha("Sessoes", s.__linha__);
}

function limparSessoesExpiradas() {
  try {
    const agora = Date.now();
    lerAbaComLinha("Sessoes")
      .filter((s) => new Date(s.expira_em).getTime() <= agora)
      .reverse()
      .forEach((s) => removerLinha("Sessoes", s.__linha__));
  } catch (e) { /* best-effort */ }
}

/* --------------------------- senhas --------------------------- */

function hashSenha(senha, salt) {
  const bruto = Utilities.newBlob(String(salt) + String(senha)).getBytes();
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bruto));
}

/* --------------------------- datas/números --------------------------- */

function agoraISO() { return new Date().toISOString(); }

function iso(d) { return d ? new Date(d).toISOString() : ""; }

/** Lead time (igual ao Django): dias entre envio e encerramento (ou hoje). */
function leadTimeDias(p) {
  if (!p.data_envio) return null;
  const envio = new Date(p.data_envio); envio.setHours(0, 0, 0, 0);
  const fim = p.concluido_em ? new Date(p.concluido_em) : new Date();
  fim.setHours(0, 0, 0, 0);
  return Math.floor((fim.getTime() - envio.getTime()) / 86400000);
}

function proximoNumeroPedido() {
  const nums = lerAba("Pedidos")
    .map((p) => String(p.numero || ""))
    .filter((n) => n.startsWith("REQ-"))
    .map((n) => parseInt(n.slice(4), 10) || 0);
  const prox = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  return "REQ-" + ("000000" + prox).slice(-6);
}

/* --------------------------- validações --------------------------- */

function exigir(cond, mensagem) {
  if (!cond) throw new Error(mensagem);
}

function exigirEmailInstitucional(email) {
  exigir(/^[^@\s]+@ms\.senai\.br$/i.test(String(email || "").trim()),
    "Só é aceito e-mail institucional @ms.senai.br.");
}

/* --------------------------- pasta de Drive --------------------------- */

function pastaRaizAnexos() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(CHAVE_PASTA_RAIZ);
  let pasta = id ? DriveApp.getFolderById(id) : null;
  if (!pasta) {
    const it = DriveApp.getFoldersByName("Compras Anexos");
    pasta = it.hasNext() ? it.next() : DriveApp.createFolder("Compras Anexos");
    props.setProperty(CHAVE_PASTA_RAIZ, pasta.getId());
  }
  return pasta;
}

function pastaPedido(numeroReq) {
  const raiz = pastaRaizAnexos();
  const it = raiz.getFoldersByName(numeroReq);
  return it.hasNext() ? it.next() : raiz.createFolder(numeroReq);
}
