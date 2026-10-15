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

  const kell = document.createElement("button");
  kell.id = "btn-notif";
  kell.type = "button";
  kell.style.cssText = "position:fixed;top:.8rem;right:.8rem;z-index:10001;border:none;border-radius:50%;width:42px;height:42px;background:#003876;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;";
  kell.innerHTML = '<i class="bi bi-bell"></i><span id="notif-badge" style="position:absolute;top:-4px;right:-4px;background:#E84910;color:#fff;border-radius:50%;font-size:.65rem;min-width:16px;height:16px;display:none;align-items:center;justify-content:center;padding:0 3px;"></span>';
  document.body.appendChild(kell);
  const painel = document.createElement("div");
  painel.id = "painel-notif";
  painel.style.cssText = "position:fixed;top:3.4rem;right:.8rem;width:320px;max-height:420px;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:.6rem;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:10000;display:none;padding:.5rem;";
  document.body.appendChild(painel);
  kell.addEventListener("click", async () => {
    painel.style.display = painel.style.display === "none" ? "block" : "none";
    if (painel.style.display === "block") await atualizarNotificacoes();
  });

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
  if (Sessao.isEquipe()) {
    itens.push({ hash: "#/documentos", icone: "bi-folder2-open", rotulo: "Documentos" });
  }
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
    /* O wrapper (.grafico-wrap) já define a altura; sem isso o canvas cresce
     * pela proporção e a legenda "escapa" para o fim da página. */
    config.options = config.options || {};
    if (config.options.maintainAspectRatio === undefined) {
      config.options.maintainAspectRatio = false;
    }
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


async function atualizarNotificacoes() {
  const badge = document.querySelector('#notif-badge');
  const painel = document.querySelector('#painel-notif');
  if (!painel) return;
  const r = await API.chamar('listarNotificacoes');
  if (!r.ok) return;
  const itens = r.data || [];
  try {
    const conhecidos = window._notifConhecidos || new Set();
    const novos = itens.filter(function(n){ return !n.lida && !conhecidos.has(n.id); });
    novos.forEach(function(n){ if (typeof mostrarMensagem === 'function') mostrarMensagem('success', n.mensagem); });
    window._notifConhecidos = new Set(itens.map(function(n){return n.id;}));
  } catch (e) { /* ignore */ }
  const naoLidas = itens.filter(function(n){return !n.lida;}).length;
  if (badge) {
    badge.style.display = naoLidas ? 'flex' : 'none';
    badge.textContent = naoLidas > 9 ? '9+' : String(naoLidas);
  }
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;"><strong>Notificacoes</strong><button class="botao botao-secundario botao-compacto" id="btn-limpar-notif">Marcar todas</button></div>';
  if (itens.length) {
    html += itens.map(function(n){
      return '<div data-id="' + n.id + '" style="padding:.5rem;border-bottom:1px solid #eee;opacity:' + (n.lida ? .6 : 1) + ';cursor:pointer"><div style="font-size:.85rem;">' + n.mensagem + '</div><div style="font-size:.7rem;color:#666;">' + fmtDataHora(n.criado_em) + (n.numero_req ? ' · ' + n.numero_req : '') + '</div></div>';
    }).join('');
  } else {
    html += '<p class="meta">Sem notificacoes.</p>';
  }
  painel.innerHTML = html;
  const btn = document.querySelector('#btn-limpar-notif');
  if (btn) btn.addEventListener('click', async function(){ await API.chamar('marcarTodasNotificacoesLidas'); await atualizarNotificacoes(); });
  painel.querySelectorAll('[data-id]').forEach(function(el){
    el.addEventListener('click', async function(){ await API.chamar('marcarNotificacaoLida', { id: el.getAttribute('data-id') }); await atualizarNotificacoes(); });
  });
}

if (!window._notifInterval) {
  window._notifInterval = setInterval(function(){ if (typeof Sessao !== 'undefined' && Sessao.ler()) atualizarNotificacoes(); }, 15000);
  if (typeof Sessao !== 'undefined' && Sessao.ler()) setTimeout(atualizarNotificacoes, 1500);
}


async function atualizarNotificacoes() {
  const badge = document.querySelector('#notif-badge');
  const painel = document.querySelector('#painel-notif');
  if (!painel) return;
  const r = await API.chamar('listarNotificacoes');
  if (!r.ok) return;
  const itens = r.data || [];
  const naoLidas = itens.filter(function(n){return !n.lida;}).length;
  if (badge) {
    badge.style.display = naoLidas ? 'flex' : 'none';
    badge.textContent = naoLidas > 9 ? '9+' : String(naoLidas);
  }
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;"><strong>Notificacoes</strong><button class="botao botao-secundario botao-compacto" id="btn-limpar-notif">Marcar todas</button></div>';
  if (itens.length) {
    html += itens.map(function(n){
      return '<div data-id="' + n.id + '" style="padding:.5rem;border-bottom:1px solid #eee;opacity:' + (n.lida ? .6 : 1) + ';cursor:pointer"><div style="font-size:.85rem;">' + n.mensagem + '</div><div style="font-size:.7rem;color:#666;">' + fmtDataHora(n.criado_em) + (n.numero_req ? ' · ' + n.numero_req : '') + '</div></div>';
    }).join('');
  } else {
    html += '<p class="meta">Sem notificacoes.</p>';
  }
  painel.innerHTML = html;
  const btn = document.querySelector('#btn-limpar-notif');
  if (btn) btn.addEventListener('click', async function(){ await API.chamar('marcarTodasNotificacoesLidas'); await atualizarNotificacoes(); });
  painel.querySelectorAll('[data-id]').forEach(function(el){
    el.addEventListener('click', async function(){ await API.chamar('marcarNotificacaoLida', { id: el.getAttribute('data-id') }); await atualizarNotificacoes(); });
  });
}

if (!window._notifInterval) {
  window._notifInterval = setInterval(function(){ if (typeof Sessao !== 'undefined' && Sessao.ler()) atualizarNotificacoes(); }, 15000);
  if (typeof Sessao !== 'undefined' && Sessao.ler()) setTimeout(atualizarNotificacoes, 1500);
}
