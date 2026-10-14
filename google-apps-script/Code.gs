/**
 * Code.gs — Roteador principal da API "Projeto Compras".
 *
 * TRANSPORTE (importante):
 *  - O SPA no GitHub Pages NÃO usa fetch: o POST /exec sofre 302 →
 *    script.googleusercontent.com e o navegador converte POST em GET,
 *    perdendo o corpo. Em vez disso, o site incorpora em um iframe a página
 *    Bridge.html (HtmlService) e conversa por postMessage com google.script.run.
 *  - doGet: serve a Bridge.html (a página do web app本身).
 *  - doPost: continua disponível p/ testes via curl/PowerShell.
 *
 * Deploy:
 *   1. Projeto vinculado à planilha "Compras_DB"; rodar ~inicializar().
 *   2. Deploy → Web app: "Executar como: Me"; acesso: "Anyone".
 *   3. A URL /exec vai em site js/config.js (CONFIG.API_URL).
 */

function doGet(e) {
  /* allowAll: permite que o SPA no GitHub Pages incorpore a Bridge em um
   * iframe (o padrão SAMEORIGIN bloqueia o embed cross-origin). */
  return HtmlService.createHtmlOutputFromFile("Bridge")
    .setTitle("API Bridge — Projeto Compras")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return resposta({ ok: false, erro: "Corpo da requisição ausente." });
    }
    const req = JSON.parse(e.postData.contents);
    const resp = rotearApi(req.action, req.token, req.payload);
    return resposta(resp);
  } catch (err) {
    return resposta({ ok: false, erro: obterMensagemErro(err) });
  }
}

/** Ponto central de roteamento (usado pela bridge e pelo doPost).
 *  Payload chega como OBJETO pela bridge e pelo doPost (JSON.parse):
 */
function rotearApi(acao, tokenStr, payload) {
  try {
    if (typeof payload === "string") {
      payload = payload ? JSON.parse(payload) : {};
    }
    payload = payload || {};
    if (tokenStr) payload._token = String(tokenStr); /* p/ ações que revogam a própria sessão */

    const rota = ROTAS_API[String(acao || "")];
    if (!rota) return { ok: false, erro: "Ação desconhecida: " + acao };

    /* Ações públicas não exigem token */
    if (ROTA_PUBLICA[String(acao || "")]) {
      return rota(payload) || { ok: true, data: null };
    }

    const usuario = validarSessao(String(tokenStr || ""));
    if (!usuario) {
      return { ok: false, erro: "Sessão expirada. Faça login novamente." };
    }

    return rota(payload, usuario) || { ok: true, data: null };
  } catch (err) {
    return { ok: false, erro: obterMensagemErro(err) };
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterMensagemErro(err) {
  if (err && err.message) return err.message;
  return String(err);
}

/* ------------------------------------------------------------------ */
/* Mapa de ações                                                       */
/* ------------------------------------------------------------------ */

const ROTAS_API = {
  /* Auth (Auth.gs) */
  login: apiLogin,
  cadastrarUsuario: apiCadastrarUsuario,
  logout: apiLogout,

  /* Reset de senha (Setup.gs) */
  solicitarResetSenha: apiSolicitarResetSenha,
  redefinirSenha: apiRedefinirSenha,

  /* Pedidos (Pedidos.gs) */
  listarPedidos: apiListarPedidos,
  detalharPedido: apiDetalharPedido,
  criarPedido: apiCriarPedido,
  enviarPedido: apiEnviarPedido,
  assumirPedido: apiAssumirPedido,
  designarPedido: apiDesignarPedido,
  tramitarPedido: apiTramitarPedido,
  excluirPedido: apiExcluirPedido,

  /* Anexos (Anexos.gs) */
  anexarArquivo: apiAnexarArquivo,
  listarAnexos: apiListarAnexos,
  listarDocumentos: apiListarDocumentos,
  baixarArquivo: apiBaixarArquivo,

  /* Usuários (Usuarios.gs) */
  meusDados: apiMeusDados,
  listarUsuarios: apiListarUsuarios,
  alterarStatusUsuario: apiAlterarStatusUsuario,
  excluirUsuario: apiExcluirUsuario,
  criarUsuarioAdmin: apiCriarUsuarioAdmin,
  alterarGrupoUsuario: apiAlterarGrupoUsuario,

  /* Agregações (Performance.gs + Dashboard.gs) */
  dashboard: apiDashboard,
  performance: apiPerformance,
  listaResponsaveis: apiListaResponsaveis,
};

/* Ações sem sessão */
const ROTA_PUBLICA = {
  login: true,
  cadastrarUsuario: true,
  solicitarResetSenha: true,
  redefinirSenha: true,
};
