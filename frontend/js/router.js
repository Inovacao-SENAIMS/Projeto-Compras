/* router.js — roteamento por hash (#/login, #/home, #/requisicoes, ...).
 * Decisões: sem library; cada rota é uma função `render()` que devolve o HTML
 * e liga os próprios eventos no #conteudo (padrão simples p/ SPA leve).
 *
 * IMPORTANTE: window.ROTAS é criado AQUI (este script carrega antes das views,
 * que registram suas rotas nele). O app.js apenas usa.
 */

window.ROTAS = {};

function rotaAtual() {
  const h = location.hash || "";
  return h.startsWith("#") ? h : "#/home";
}

function renderizarRota() {
  const rota = rotaAtual();
  const s = Sessao.ler();
  const publica = rota === "#/login" || rota === "#/cadastro" || rota.startsWith("#/redefinir/");

  /* Guarda de sessão: qualquer rota protegida sem sessão → login */
  if (!s && !publica) { location.hash = "#/login"; return; }
  if (s && (rota === "#/login" || rota === "#/cadastro")) { location.hash = "#/home"; return; }

  const fn = (window.ROTAS || {})[rota]
    || (rota.startsWith("#/tramitar/") && (window.ROTAS || {})["#/tramitar/<numero>"])
    || (rota.startsWith("#/redefinir/") && (window.ROTAS || {})["#/redefinir/<token>"])
    || null;
  if (!fn) {
    /* Rota desconhecida: mensagem visível em vez de tela em branco. */
    const alvo = qs("#app");
    if (alvo) {
      alvo.innerHTML = `<ul class="mensagens"><li class="msg msg-error">
        <i class="bi bi-x-circle-fill"></i><span>Tela não encontrada (${esc(rota)}).
        <a href="#/login">Voltar ao login</a></span></li></ul>`;
    }
    return;
  }

  try {
    /* Passa o "sobrenome" da rota (nº da requisição / token) quando existir. */
    const parametro = (rota.startsWith("#/tramitar/") || rota.startsWith("#/redefinir/"))
      ? decodeURIComponent(rota.split("/").pop() || "")
      : undefined;
    fn(parametro);
  } catch (e) {
    console.error(e);
    const c = qs("#conteudo") || qs("#app");
    c.innerHTML = `<ul class="mensagens"><li class="msg msg-error"><i class="bi bi-x-circle-fill"></i>
      <span>Erro inesperado na tela: ${esc(e.message)}</span></li></ul>`;
  }
}

window.addEventListener("hashchange", renderizarRota);
