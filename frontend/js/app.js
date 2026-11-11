/* app.js — bootstrap da aplicação. */
async function iniciarApp() {
  const rota = rotaAtual();
  const s = Sessao.ler();
  const publica = rota === "#/login" || rota === "#/cadastro" || rota.startsWith("#/redefinir/");

  if (!s) {
    /* Telas públicas montam seu próprio interior em #app (via view). */
    if (!publica) location.hash = "#/login";
    renderizarRota();
    return;
  }

  montarLayout();
  atualizarNav(publica ? "#/home" : rota);
  renderizarRota();
}

/* Sessão expirada no meio de uma chamada (API dispara EV_SESSAO_EXPIRADA):
 * volta ao login com mensagem. */
document.addEventListener(API.EV_SESSAO_EXPIRADA, (e) => {
  location.hash = "#/login";
  setTimeout(() => mostrarMensagem("error", e.detail || "Sessão expirada."), 50);
});

/* Carrega config central (backend) para manter UI alinhada. Fallback local caso erre */
(async function bootstrap() {
  try {
    const resp = await API.chamar("config", {}, "");
    if (resp && resp.ok && resp.data) {
      CONFIG.INSTITUTOS = resp.data.institutos || CONFIG.INSTITUTOS;
      CONFIG.MODALIDADES = resp.data.modalidades || CONFIG.MODALIDADES;
      CONFIG.URGENCIAS = resp.data.urgencias || CONFIG.URGENCIAS;
      CONFIG.STATUS = resp.data.status || CONFIG.STATUS;
    }
  } catch (e) { /* best-effort */ }
  await iniciarApp();
})();