/* ui.js — construção do shell da aplicação (sidebar + conteúdo).
 * Usa exatamente as mesmas classes de frontend/templates/base.html para
 * herdar todo o estilo de frontend/static/css/style.css (cópia em site/css).
 */

function layoutPronto() {
  const s = Sessao.ler();
  return qs(".layout") && s;
}

function montarLayout() {
  const s = Sessao.ler();
  qs("#app").innerHTML = `
  <div class="layout">
    <div id="mensagens-flutuantes" hidden></div>
    <aside class="sidebar">
      <a class="sidebar-marca" href="#/home">
        <span class="sidebar-logo"><img src="img/SENAI.png" alt="SENAI | Sistema FIEMS"></span>
      </a>
      <div class="sidebar-meio">
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
      </div>
      <div class="sidebar-rodape">
        <button type="button" class="nav-item nav-sair" id="btn-logout">
          <i class="bi bi-box-arrow-right"></i> <span>Logout</span>
        </button>
        <div class="sidebar-usuario">
          <i class="bi bi-person-circle"></i>
          <span class="usuario">${esc(s.nome)}</span>
        </div>
        <footer class="rodape-marca rodape-lateral">
          <img src="img/SENAI.png" alt="SENAI | Sistema FIEMS">
        </footer>
      </div>
    </aside>
    <main class="conteudo" id="conteudo"></main>
  </div>`;

  qs("#btn-logout").addEventListener("click", async () => {
    const token = Sessao.ler() && Sessao.ler().token;
    Sessao.limpar();
    API.chamar("logout", {}, token).catch(() => {});
    location.hash = "#/login";
  });
}

function atualizarNav(routeAtiva) {
  const s = Sessao.ler();
  const nav = qs("#sidebar-nav");
  if (!nav || !s) return;

  const itens = [
    { hash: "#/home",             icone: "bi-house-door",  rotulo: "Home" },
    { hash: "#/requisicoes",      icone: "bi-inboxes",     rotulo: "Requisições" },
  ];
  if (Sessao.isGestor()) {
    itens.push({ hash: "#/performance", icone: "bi-graph-up-arrow", rotulo: "Performance" });
    itens.push({ hash: "#/usuarios", icone: "bi-people", rotulo: "Usuários" });
  }
  itens.push({ hash: "#/configuracoes", icone: "bi-gear", rotulo: "Configurações" });

  nav.innerHTML = itens.map(i =>
    `<a class="nav-item ${routeAtiva === i.hash ? "ativo" : ""}" href="${i.hash}">
      <i class="bi ${i.icone}"></i> <span>${i.rotulo}</span></a>`
  ).join("");
}

/** Renderiza o interior do <main class="conteudo"> com o título da página. */
function conteudoInner(titulo, htmlExtra) {
  return `<header class="pagina-cabecalho"><h1>${esc(titulo)}</h1></header>${htmlExtra || ""}`;
}

/** Cria um gráfico Chart.js de forma tolerante a falhas.
 * Se o Chart.js não estiver disponível (CDN bloqueado/offline) ou o canvas
 * não existir, não lança erro — a página continua funcionando. */
function criarGrafico(idOuEl, config) {
  const el = typeof idOuEl === "string" ? qs(idOuEl) : idOuEl;
  if (!el || typeof Chart === "undefined") return null;
  try {
    return new Chart(el, config);
  } catch (e) {
    console.error("Falha ao criar gráfico:", e);
    return null;
  }
}

/* Barra de filtros reutilizável: expandir / fixar (persistido) / recolher.
 * Padrão comum às páginas de Requisições e Performance.
 *
 * opts = { area, toggle, fixar, chave, contar }
 *   area/toggle/fixar : seletores CSS dos elementos já renderizados
 *   chave             : chave de localStorage (uma por página)
 *   contar            : função que retorna o nº de filtros ativos (badge)
 */
function inicializarBarraFiltros(opts) {
  const area = qs(opts.area);
  const btnToggle = qs(opts.toggle);
  const btnFixar = qs(opts.fixar);
  if (!area || !btnToggle || !btnFixar) return { atualizar() {} };

  let fixado = localStorage.getItem(opts.chave) === "1";
  let visivel = fixado;
  const contar = typeof opts.contar === "function" ? opts.contar : () => 0;

  function atualizar() {
    area.hidden = !visivel;

    const n = contar();
    btnToggle.innerHTML =
      `<i class="bi bi-funnel${visivel ? "-fill" : ""}"></i> ` +
      (visivel ? "Ocultar filtros" : "Mostrar filtros") +
      (n ? ` <span class="badge-filtros">${n}</span>` : "") +
      ` <i class="bi bi-chevron-${visivel ? "up" : "down"}"></i>`;

    btnFixar.innerHTML =
      `<i class="bi bi-pin-angle${fixado ? "-fill" : ""}"></i> ` +
      (fixado ? "Menu fixado" : "Fixar Menu");
    btnFixar.classList.toggle("botao-ativo", fixado);
    btnFixar.title = fixado
      ? "Clique para desafixar (a faixa volta a recolher automaticamente)"
      : "Manter a faixa de filtros sempre expandida";
  }

  btnToggle.addEventListener("click", () => {
    visivel = !visivel;
    if (!visivel) { fixado = false; localStorage.removeItem(opts.chave); }
    atualizar();
  });

  btnFixar.addEventListener("click", () => {
    fixado = !fixado;
    visivel = fixado; /* fixar abre; desafixar recolhe */
    if (fixado) localStorage.setItem(opts.chave, "1");
    else localStorage.removeItem(opts.chave);
    atualizar();
  });

  atualizar();
  return { atualizar, estaVisivel: () => visivel };
}
