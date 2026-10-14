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
      </div>
    </aside>
    <main class="conteudo" id="conteudo"></main>
  </div>
  <footer class="rodape-marca"><img src="img/SENAI.png" alt="SENAI | Sistema FIEMS"></footer>`;

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
