/* router.js — roteamento por hash (#/login, #/home, #/requisicoes, ...).
 * Decisões: sem library; cada rota é uma função `render()` que devolve o HTML
 * e liga os próprios eventos no #conteudo (padrão simples p/ SPA leve).
 */

const Rotas = (() => ({}))(); // preenchido por views/*.js (objeto global ROTAS)

function rotaAtual() {
  const h = location.hash || "";
  return h.startsWith("#") ? h : "#/home";
}

function renderizarRota() {
  const rota = rotaAtual();
  const s = Sessao.ler();
  const publica = rota === "#/login" || rota === "#/cadastro";

  /* Guarda de sessão: qualquer rota protegida sem sessão → login */
  if (!s && !publica) { location.hash = "#/login"; return; }
  if (s && publica)   { location.hash = "#/home"; return; }

  const fn = (window.ROTAS || {})[rota]
    || (rota.startsWith("#/tramitar/") && (window.ROTAS || {})["#/tramitar/<numero>"])
    || null;
  if (!fn) { location.hash = s ? "#/home" : "#/login"; return; }

  try {
    /* Passa o "sobrenome" da rota (ex.: nº da requisição) quando existir. */
    const parametro = rota.startsWith("#/tramitar/")
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
