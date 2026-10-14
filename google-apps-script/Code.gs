/**
 * Code.gs — Roteador principal da API "Projeto Compras".
 *
 * Deploy (obrigatório na ordem):
 *   1. Este projeto DEVE estar vinculado à planilha "Compras_DB".
 *   2. Executar ~inicializar(): cria abas e pastas idempotentemente.
 *   3. Deploy → New deployment → Web app:
 *        - Execute as: Me (dono da planilha)
 *        - Who has access: Anyone
 *   4. Copiar a URL /exec para site/js/config.js → CONFIG.API_URL.
 *
 * Convenção de chamada (do client):
 *   POST body JSON: { action, token, payload }
 *   Resposta:       { ok: true, data } | { ok: false, erro }
 */

function doGet(e) {
  return resposta({ ok: false, erro: "Use POST." });
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return resposta({ ok: false, erro: "Corpo da requisição ausente." });
    }
    const req = JSON.parse(e.postData.contents);
    const acao = String(req.action || "");
    const token = String(req.token || "");
    const payload = req.payload || {};
    if (token) payload._token = token; /* ações que precisam revogar a própria sessão */

    const rota = ROTAS_API[acao];
    if (!rota) {
      return resposta({ ok: false, erro: "Ação desconhecida: " + acao });
    }

    /* Ações públicas não exigem token */
    if (ROTA_PUBLICA[acao]) {
      return resposta(rota(payload) || { ok: true, data: null });
    }

    const usuario = validarSessao(token);
    if (!usuario) {
      return resposta({ ok: false, erro: "Sessão expirada. Faça login novamente." });
    }

    return resposta(rota(payload, usuario) || { ok: true, data: null });
  } catch (err) {
    return resposta({ ok: false, erro: obterMensagemErro(err) });
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
  baixarArquivo: apiBaixarArquivo,

  /* Usuários (Usuarios.gs) */
  meusDados: apiMeusDados,
  listarUsuarios: apiListarUsuarios,
  alterarStatusUsuario: apiAlterarStatusUsuario,
  excluirUsuario: apiExcluirUsuario,

  /* Agregações (Performance.gs + Dashboard.gs) */
  dashboard: apiDashboard,
  performance: apiPerformance,
  listaResponsaveis: apiListaResponsaveis,
};

/* Ações sem sessão */
const ROTA_PUBLICA = {
  login: true,
  cadastrarUsuario: true,
};
