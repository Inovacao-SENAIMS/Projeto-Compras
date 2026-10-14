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

iniciarApp();
