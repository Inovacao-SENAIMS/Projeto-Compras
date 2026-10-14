/* views/requisicoes.js — Painel de Requisições (#/requisicoes).
 * Clone do solicitante/painel.html + equipe/lista.html:
 * tabela de 10 colunas (nowrap), filtros completos, ordenação por cabeçalho,
 * modal de nova requisição (Documentação obrigatória; Cotação se "Sim"),
 * ações com Bootstrap Icons e Exportar CSV.
 */

let REQ_CACHE = [];
let RESPO_LISTA = [];
let ORDENACAO = { campo: null, dir: 1 };

/* Faixa de filtros: recolhida por padrão; "Fixar Menu" mantém expandida
 * (persistido em localStorage entre navegações e recarregamentos). */
const CHAVE_FILTROS_FIXADO = "compras.filtros.fixado";
let FILTROS_FIXADO = false;
let FILTROS_VISIVEL = false;

ROTAS["#/requisicoes"] = async function () {
  atualizarNav("#/requisicoes");
  const equipe = Sessao.isEquipe();
  ORDENACAO = { campo: null, dir: 1 };

  /* Estado dos filtros: recolhido por padrão; "fixado" persiste. */
  FILTROS_FIXADO = localStorage.getItem(CHAVE_FILTROS_FIXADO) === "1";
  FILTROS_VISIVEL = FILTROS_FIXADO;

  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="cabecalho-pagina">
      <h2><i class="bi bi-inboxes"></i> ${equipe ? "Requisições — Equipe de Compras" : "Requisições — Solicitante"}</h2>
      <button type="button" class="botao" id="btn-nova">
        <i class="bi bi-plus-lg"></i> Nova Requisição
      </button>
    </div>
    <div class="carregando" id="req-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="req-conteudo" hidden></div>`;

  qs("#btn-nova").addEventListener("click", modalNovaRequisicao);

  const r = await API.chamar("listarPedidos");
  qs("#req-loading").hidden = true;
  if (!r.ok) { mostrarMensagem("error", r.erro); return; }
  REQ_CACHE = r.data;

  const nomesResp = new Map();
  REQ_CACHE.forEach((p) => { if (p.responsavel) nomesResp.set(p.responsavel, p.responsavel_nome); });

  if (Sessao.isGestor()) {
    const rr = await API.chamar("listaResponsaveis");
    RESPO_LISTA = rr.ok ? rr.data : [];
  }

  qs("#req-conteudo").innerHTML = `
    <div class="filtros-barra">
      <button type="button" class="botao botao-secundario botao-compacto" id="btn-toggle-filtros"></button>
      <button type="button" class="botao botao-secundario botao-compacto" id="btn-fixar-filtros"
              title="Manter a faixa de filtros sempre expandida"></button>
    </div>
    <div id="area-filtros" hidden>${montarFiltros([...nomesResp.entries()])}</div>
    <div class="tabela-scroll">
      <table class="tabela" id="tbl">
        <thead><tr id="tbl-head"></tr></thead>
        <tbody id="tbl-body"></tbody>
      </table>
      <p class="vazio" id="tbl-vazio" hidden>Nenhuma requisição encontrada.</p>
    </div>`;

  qs("#req-conteudo").hidden = false;
  qsa(".filtros input, .filtros select").forEach((el) =>
    el.addEventListener("change", () => { renderTabela(); atualizarBarraFiltros(); }));

  /* ---- expandir / fixar / recolher a faixa de filtros ---- */
  const areaFiltros = qs("#area-filtros");
  const btnToggle = qs("#btn-toggle-filtros");
  const btnFixar = qs("#btn-fixar-filtros");

  function filtrosAtivos() {
    const f = filtroValores();
    return Object.keys(f).filter((k) => f[k] !== "").length;
  }

  function atualizarBarraFiltros() {
    areaFiltros.hidden = !FILTROS_VISIVEL;

    const n = filtrosAtivos();
    btnToggle.innerHTML =
      `<i class="bi bi-funnel${FILTROS_VISIVEL ? "-fill" : ""}"></i> ` +
      (FILTROS_VISIVEL ? "Ocultar filtros" : "Mostrar filtros") +
      (n ? ` <span class="badge-filtros">${n}</span>` : "") +
      ` <i class="bi bi-chevron-${FILTROS_VISIVEL ? "up" : "down"}"></i>`;

    btnFixar.innerHTML =
      `<i class="bi bi-pin-angle${FILTROS_FIXADO ? "-fill" : ""}"></i> ` +
      (FILTROS_FIXADO ? "Menu fixado" : "Fixar Menu");
    btnFixar.classList.toggle("botao-ativo", FILTROS_FIXADO);
    btnFixar.title = FILTROS_FIXADO
      ? "Clique para desafixar (a faixa volta a recolher automaticamente)"
      : "Manter a faixa de filtros sempre expandida";
  }

  btnToggle.addEventListener("click", () => {
    FILTROS_VISIVEL = !FILTROS_VISIVEL;
    /* recolher deixa de manter fixado (o normal é recolhido) */
    if (!FILTROS_VISIVEL) {
      FILTROS_FIXADO = false;
      localStorage.removeItem(CHAVE_FILTROS_FIXADO);
    }
    atualizarBarraFiltros();
  });

  btnFixar.addEventListener("click", () => {
    FILTROS_FIXADO = !FILTROS_FIXADO;
    FILTROS_VISIVEL = FILTROS_FIXADO; /* fixar abre; desafixar recolhe */
    if (FILTROS_FIXADO) localStorage.setItem(CHAVE_FILTROS_FIXADO, "1");
    else localStorage.removeItem(CHAVE_FILTROS_FIXADO);
    atualizarBarraFiltros();
  });

  /* Limpar filtros (botão dentro do container de filtros) */
  const btnLimpar = qs("#btn-limpar");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      qsa(".filtros input, .filtros select").forEach((el) => { el.value = ""; });
      renderTabela();
      atualizarBarraFiltros();
    });
  }

  atualizarBarraFiltros();

  renderTabela();
};

/* -------------------------------------------------- filtros */
function montarFiltros(responsaveis) {
  const modalidades = Object.entries(CONFIG.MODALIDADES)
    .map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  const status = Object.entries(CONFIG.STATUS)
    .map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  return `
  <form class="filtros" onsubmit="return false">
    <div class="filtros-grade">
      <div class="filtro-campo">
        <label for="f-responsavel"><i class="bi bi-person"></i> Responsável</label>
        <select id="f-responsavel" class="campo">
          <option value="">Todos</option>
          ${responsaveis.map(([em, n]) => `<option value="${em}">${esc(n)}</option>`).join("")}
        </select>
      </div>
      <div class="filtro-campo">
        <label for="f-modalidade"><i class="bi bi-list-check"></i> Modalidade (RCA)</label>
        <select id="f-modalidade" class="campo"><option value="">Todas</option>${modalidades}</select>
      </div>
      <div class="filtro-campo">
        <label for="f-status"><i class="bi bi-flag"></i> Status</label>
        <select id="f-status" class="campo"><option value="">Todos</option>${status}</select>
      </div>
      <div class="filtro-campo">
        <label><i class="bi bi-calendar-event"></i> Abertura (de/até)</label>
        <div class="filtro-duplo">
          <input type="date" id="f-abertura_ini" class="campo" title="De">
          <input type="date" id="f-abertura_fim" class="campo" title="Até">
        </div>
      </div>
      <div class="filtro-campo">
        <label><i class="bi bi-send"></i> Envio (de/até)</label>
        <div class="filtro-duplo">
          <input type="date" id="f-envio_ini" class="campo" title="De">
          <input type="date" id="f-envio_fim" class="campo" title="Até">
        </div>
      </div>
      <div class="filtro-campo">
        <label><i class="bi bi-flag"></i> Encerramento (de/até)</label>
        <div class="filtro-duplo">
          <input type="date" id="f-encerramento_ini" class="campo" title="De">
          <input type="date" id="f-encerramento_fim" class="campo" title="Até">
        </div>
      </div>
      <div class="filtro-campo">
        <label><i class="bi bi-hourglass-split"></i> Lead time (dias)</label>
        <div class="filtro-duplo">
          <input type="number" min="0" id="f-lead_min" class="campo" placeholder="mín.">
          <input type="number" min="0" id="f-lead_max" class="campo" placeholder="máx.">
        </div>
      </div>
    </div>
    <div class="filtros-acoes">
      <button type="button" class="botao botao-exportar" id="btn-csv"
              title="Exportar a lista respeitando os filtros aplicados">
        <i class="bi bi-filetype-csv"></i> Exportar CSV
      </button>
      <button type="button" class="botao botao-secundario" id="btn-limpar"
              title="Limpar todos os filtros">
        <i class="bi bi-x-lg"></i> Limpar
      </button>
    </div>
  </form>`;
}

/* -------------------------------------------------- filtro/ordenação */
function filtroValores() {
  return {
    responsavel: val("f-responsavel"),
    modalidade: val("f-modalidade"),
    status: val("f-status"),
    abertura_ini: val("f-abertura_ini"), abertura_fim: val("f-abertura_fim"),
    envio_ini: val("f-envio_ini"), envio_fim: val("f-envio_fim"),
    encerramento_ini: val("f-encerramento_ini"), encerramento_fim: val("f-encerramento_fim"),
    lead_min: val("f-lead_min"), lead_max: val("f-lead_max"),
  };
}

function valorOrdenavel(p, campo) {
  switch (campo) {
    case "numero": return p.numero || "";
    case "responsavel": return (p.responsavel_nome || "").toLowerCase();
    case "item": return (p.produto || "").toLowerCase();
    case "modalidade": return (p.modalidade || "").toLowerCase();
    case "abertura": return p.criado_em || "";
    case "envio": return p.data_envio || "";
    case "status": return p.status || "";
    case "encerramento": return p.concluido_em || "";
    case "lead": return p.lead_time_dias == null ? -1 : p.lead_time_dias;
    default: return "";
  }
}

function listaVisivel() {
  const f = filtroValores();
  let ls = REQ_CACHE.filter((p) => {
    if (f.responsavel && p.responsavel !== f.responsavel) return false;
    if (f.modalidade && p.modalidade !== f.modalidade) return false;
    if (f.status && p.status !== f.status) return false;
    const emFaixa = (campo, ini, fim) => {
      if (!ini && !fim) return true;
      const d = campo ? campo.slice(0, 10) : null;
      if (!d) return false;
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      return true;
    };
    if (!emFaixa(p.criado_em, f.abertura_ini, f.abertura_fim)) return false;
    if (!emFaixa(p.data_envio, f.envio_ini, f.envio_fim)) return false;
    if (!emFaixa(p.concluido_em, f.encerramento_ini, f.encerramento_fim)) return false;
    if (f.lead_min || f.lead_max) {
      const lead = p.lead_time_dias;
      if (lead == null) return false;
      if (f.lead_min && lead < +f.lead_min) return false;
      if (f.lead_max && lead > +f.lead_max) return false;
    }
    return true;
  });

  if (ORDENACAO.campo) {
    ls = ls.slice().sort((a, b) => {
      const A = valorOrdenavel(a, ORDENACAO.campo), B = valorOrdenavel(b, ORDENACAO.campo);
      return (A > B ? 1 : A < B ? -1 : 0) * ORDENACAO.dir;
    });
  }
  return ls;
}

/* -------------------------------------------------- tabela */
const COLUNAS = [
  ["numero", "Nº da Requisição"], ["responsavel", "Responsável"], ["item", "Item"],
  ["modalidade", "Modalidade (RCA)"], ["abertura", "Data de Abertura"],
  ["envio", "Data de Envio"], ["status", "Status"],
  ["encerramento", "Data de Encerramento"], ["lead", "Lead Time"], [null, "Ações"],
];

function renderTabela() {
  const equipe = Sessao.isEquipe();
  qs("#tbl-head").innerHTML = COLUNAS.map(([c, n]) =>
    c ? `<th class="th-ordenar" data-campo="${c}" style="cursor:pointer">${n}${ORDENACAO.campo === c ? (ORDENACAO.dir > 0 ? " ▲" : " ▼") : ""}</th>`
      : `<th>${n}</th>`).join("");

  qsa("#tbl-head .th-ordenar").forEach((th) => th.addEventListener("click", () => {
    const c = th.dataset.campo;
    if (ORDENACAO.campo === c) ORDENACAO.dir *= -1; else { ORDENACAO.campo = c; ORDENACAO.dir = 1; }
    renderTabela();
  }));

  const ls = listaVisivel();
  qs("#tbl-vazio").hidden = ls.length > 0;

  qs("#tbl-body").innerHTML = ls.map((p) => `
    <tr>
      <td>${esc(p.numero)}</td>
      <td>${p.responsavel
        ? (Sessao.isGestor()
            ? `<a class="link-designar" href="#" data-numero="${esc(p.numero)}" title="Designar / Alterar Responsável">${esc(p.responsavel_nome)}</a>`
            : esc(p.responsavel_nome))
        : '<span class="sem-responsavel">—</span>'}</td>
      <td><span class="celula-truncada" title="${esc(p.produto)}">${esc(p.produto)}</span></td>
      <td>${esc(CONFIG.MODALIDADES[p.modalidade] || "—")}</td>
      <td>${fmtDataHora(p.criado_em)}</td>
      <td>${fmtDataHora(p.data_envio)}</td>
      <td><span class="tag status-${p.status}">${CONFIG.STATUS[p.status] || p.status}</span></td>
      <td>${fmtDataHora(p.concluido_em)}</td>
      <td>${fmtLead(p.lead_time_dias)}</td>
      <td class="acoes-tabela">${acoesHTML(p, equipe)}</td>
    </tr>`).join("");
}

function acoesHTML(p, equipe) {
  const s = Sessao.ler();
  const btn = (acao, icone, titulo, perigo) =>
    `<button type="button" class="btn-icone ${perigo ? "btn-icone-perigo" : ""}" data-acao="${acao}" data-numero="${esc(p.numero)}" title="${titulo}"><i class="bi ${icone}"></i></button>`;
  const out = [];

  if (!equipe && p.criado_por === s.email && p.status === "aberta") {
    out.push(btn("enviar", "bi-send", "Enviar"));
    out.push(btn("excluir", "bi-trash", "Excluir", true));
  }
  if (equipe && p.status === "enviada") out.push(btn("assumir", "bi-hand-index-thumb", "Assumir"));
  if (equipe && p.status === "em_analise") out.push(btn("tramitar", "bi-arrow-repeat", "Tramitar"));
  out.push(btn("anexos", "bi-paperclip", "Anexos"));
  out.push(btn("detalhes", "bi-eye", "Ver Detalhes"));
  return out.join("");
}

async function recarregar() {
  const r = await API.chamar("listarPedidos");
  if (r.ok) REQ_CACHE = r.data;
  renderTabela();
}

/* -------------------------------------------------- ações (delegação) */
document.addEventListener("click", async (e) => {
  const link = e.target.closest(".link-designar");
  if (link) { e.preventDefault(); modalDesignar(link.dataset.numero); return; }

  const btn = e.target.closest(".btn-icone[data-acao]");
  if (!btn) return;

  const acao = btn.dataset.acao;
  const numero = btn.dataset.numero;

  if (acao === "detalhes") { modalDetalhes(numero); return; }
  if (acao === "anexos") { modalAnexos(numero); return; }
  if (acao === "tramitar") { location.hash = "#/tramitar/" + encodeURIComponent(numero); return; }

  if (acao === "enviar") {
    const r = await API.chamar("enviarPedido", { numero });
    if (mostrarSucessoOuErro(r)) await recarregar();
    return;
  }
  if (acao === "excluir") {
    if (!await confirmarModal("Excluir a requisição " + numero + "? Os anexos também serão removidos do disco.", "Excluir requisição")) return;
    const r = await API.chamar("excluirPedido", { numero });
    if (mostrarSucessoOuErro(r)) await recarregar();
    return;
  }
  if (acao === "assumir") {
    const r = await API.chamar("assumirPedido", { numero });
    if (mostrarSucessoOuErro(r)) await recarregar();
    return;
  }
  if (acao === "baixar") {
    const r = await API.chamar("baixarArquivo", { id: btn.dataset.anexo });
    if (r.ok) {
      const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: r.data.mime }));
      a.download = r.data.nome;
      a.click();
    } else mostrarMensagem("error", r.erro);
  }
});

/* exportar CSV (delegado: botão existe após fetch) */
document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-csv")) exportarCSV();
});

function exportarCSV() {
  const ls = listaVisivel();
  const cab = ["Nº da Requisição", "Responsável", "Item", "Modalidade (RCA)",
               "Data de Abertura", "Data de Envio", "Status", "Data de Encerramento", "Lead Time (dias)"];
  const linhas = ls.map((p) => [
    p.numero, p.responsavel_nome || "", p.produto,
    CONFIG.MODALIDADES[p.modalidade] || p.modalidade,
    fmtDataHora(p.criado_em), fmtDataHora(p.data_envio),
    CONFIG.STATUS[p.status] || p.status, fmtDataHora(p.concluido_em),
    p.lead_time_dias == null ? "" : p.lead_time_dias,
  ]);
  baixarCSV("requisicoes.csv", [cab, ...linhas].map((l) => l.map(csvEsc).join(";")).join("\n"));
}

/* -------------------------------------------------- infra de modal */
function abrirModalHTML(html) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay aberto";   /* a CSS exige "aberto" p/ centralizar */
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-fechar]")) overlay.remove();
  });
  return overlay;
}

/* -------------------------------------------------- modal: nova requisição */
function camposRequisicao() {
  const modalidades = Object.entries(CONFIG.MODALIDADES)
    .map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  const urgencias = Object.entries(CONFIG.URGENCIAS)
    .map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  const s = Sessao.ler();
  return `
    <p>
      <label for="r-produto">Nome do Produto</label>
      <input id="r-produto" class="campo" required>
    </p>
    <p>
      <label for="r-descricao">Descrição do Objeto</label>
      <textarea id="r-descricao" class="campo" rows="3"></textarea>
    </p>
    <div class="campo-duplo">
      <p>
        <label for="r-quantidade">Quantidade</label>
        <input id="r-quantidade" type="number" min="1" value="1" class="campo">
      </p>
      <p>
        <label for="r-modalidade">Modalidade RCA</label>
        <select id="r-modalidade" class="campo" required>${modalidades}</select>
      </p>
    </div>
    <div class="campo-duplo">
      <p>
        <label for="r-urgencia">Urgência</label>
        <select id="r-urgencia" class="campo">${urgencias}</select>
      </p>
      <p>
        <label>Solicitante</label>
        <input value="${esc(s.nome)}" class="campo" disabled>
      </p>
    </div>
    <div class="campo-duplo">
      <p>
        <label for="r-cotacao-sim">Possui cotação?</label>
        <select id="r-cotacao-sim" class="campo">
          <option value="0" selected>Não</option>
          <option value="1">Sim</option>
        </select>
      </p>
      <p id="wrap-cotacao-arquivo" hidden>
        <label for="r-arquivo-cotacao">Cotação (anexo)</label>
        <input id="r-arquivo-cotacao" type="file" class="campo">
      </p>
    </div>
    <p>
      <label for="r-arquivo-doc">Documentação (anexo) — obrigatória</label>
      <input id="r-arquivo-doc" type="file" class="campo" required>
    </p>`;
}

function modalNovaRequisicao() {
  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho"><h2>Registrar Requisição</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button></div>
    <div class="modal-corpo">
      <form id="form-nova" class="formulario">
        ${camposRequisicao()}
        <div class="modal-acoes">
          <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Registrar</button>
          <button type="button" class="botao botao-cancelar" data-fechar>Cancelar</button>
        </div>
      </form>
    </div>`);

  const sim = overlay.querySelector("#r-cotacao-sim");
  const wrap = overlay.querySelector("#wrap-cotacao-arquivo");
  sim.addEventListener("change", () => { wrap.hidden = sim.value !== "1"; });

  overlay.querySelector("#form-nova").addEventListener("submit", async (e) => {
    e.preventDefault();

    const coletar = (id) => overlay.querySelector("#" + id).files[0] || null;
    const doc = coletar("r-arquivo-doc");
    const cot = coletar("r-arquivo-cotacao");
    if (!doc) { mostrarMensagem("error", "Documentação (anexo) é obrigatória."); return; }
    if (sim.value === "1" && !cot) { mostrarMensagem("error", "Cotação (anexo) é obrigatória quando 'Possui cotação?' = Sim."); return; }

    const anexos = [];

    const funcValidar = async (file, tipo, arqObrigatorio) => {
      if (!file) return;
      const erro = API.validarArquivo(file);
      if (erro) { mostrarMensagem("error", erro); throw new Error("validacao"); }
      anexos.push({ tipo, nome_original: file.name, base64: await API.lerArquivoBase64(file) });
    };
    try {
      await funcValidar(doc, "documentacao", true);
      if (sim.value === "1") await funcValidar(cot, "cotacao", true);
    } catch (x) {
      if (x && x.message !== "validacao") console.error(x);
      return;
    }

    const payload = {
      produto: overlay.querySelector("#r-produto").value.trim(),
      descricao_objeto: overlay.querySelector("#r-descricao").value.trim(),
      quantidade: overlay.querySelector("#r-quantidade").value || "1",
      modalidade: overlay.querySelector("#r-modalidade").value,
      urgencia: overlay.querySelector("#r-urgencia").value,
      possui_cotacao: sim.value === "1",
      anexos,
    };
    if (!payload.produto) { mostrarMensagem("error", "Informe o nome do produto."); return; }

    const r = await API.chamar("criarPedido", payload);
    if (mostrarSucessoOuErro(r)) {
      overlay.remove();
      await recarregar();
    }
  });
}

/* -------------------------------------------------- modal: designar */
function modalDesignar(numero) {
  if (!Sessao.isGestor()) return;
  const opts = RESPO_LISTA.map((u) =>
    `<a class="lista-responsavel-item" href="#" data-email="${esc(u.email)}">${esc(u.nome)}</a>`).join("");

  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho"><h2>Designar / Alterar Responsável — ${esc(numero)}</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button></div>
    <div class="modal-corpo"><div class="lista-responsaveis">${opts || '<p class="meta">Nenhum membro do Time disponível.</p>'}</div></div>`);

  overlay.querySelectorAll(".lista-responsavel-item").forEach((a) =>
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!await confirmarModal("Designar " + a.textContent + " para a requisição " + numero + "?", "Designar responsável")) return;
      const r = await API.chamar("designarPedido", { numero, responsavel: a.dataset.email });
      if (mostrarSucessoOuErro(r)) { overlay.remove(); await recarregar(); }
    }));
}

/* -------------------------------------------------- modal: anexos / detalhes */
async function modalAnexos(numero) {
  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho"><h2>Anexos — ${esc(numero)}</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button></div>
    <div class="modal-corpo">
      <ul id="lista-anexos" class="anexos"><li class="meta">Carregando…</li></ul>
      <form id="form-anexo" class="formulario" style="margin-top:.8rem">
        <div class="campo-duplo">
          <p><label for="a-tipo">Tipo</label>
            <select id="a-tipo" class="campo">
              <option value="documentacao">Documentação</option>
              <option value="cotacao">Cotação</option>
            </select></p>
          <p><label for="a-arquivo">Arquivo</label>
            <input id="a-arquivo" type="file" class="campo"></p>
        </div>
        <div class="modal-acoes">
          <button type="submit" class="botao"><i class="bi bi-paperclip"></i> Anexar</button>
        </div>
      </form>
    </div>`);

  const listar = async () => {
    const r = await API.chamar("listarAnexos", { numero });
    const ul = overlay.querySelector("#lista-anexos");
    if (!r.ok) { ul.innerHTML = `<li class="meta">${esc(r.erro)}</li>`; return; }
    if (!r.data.length) { ul.innerHTML = `<li class="meta">Nenhum anexo.</li>`; return; }
    ul.innerHTML = r.data.map((a) => `
      <li>
        <span class="tag">${a.tipo === "cotacao" ? "Cotação" : "Documentação"}</span>
        ${esc(a.nome_original)}
        <span class="meta">${esc(a.enviado_por)} · ${fmtDataHora(a.enviado_em)}</span>
        <button type="button" class="btn-icone" title="Baixar" data-baixar="${esc(a.id)}">
          <i class="bi bi-download"></i></button>
      </li>`).join("");
  };
  await listar();

  overlay.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-baixar]");
    if (!b) return;
    const r = await API.chamar("baixarArquivo", { id: b.dataset.baixar });
    if (r.ok) {
      const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: r.data.mime }));
      a.download = r.data.nome;
      a.click();
    } else mostrarMensagem("error", r.erro);
  });

  overlay.querySelector("#form-anexo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = overlay.querySelector("#a-arquivo").files[0];
    if (!file) { mostrarMensagem("error", "Selecione o arquivo."); return; }
    const erro = API.validarArquivo(file);
    if (erro) { mostrarMensagem("error", erro); return; }
    const r = await API.chamar("anexarArquivo", {
      numero, tipo: overlay.querySelector("#a-tipo").value,
      nome_original: file.name, base64: await API.lerArquivoBase64(file),
    });
    if (mostrarSucessoOuErro(r)) {
      overlay.querySelector("#a-arquivo").value = "";
      await listar();
    }
  });
}

async function modalDetalhes(numero) {
  const r = await API.chamar("detalharPedido", { numero });
  if (!r.ok) { mostrarMensagem("error", r.erro); return; }
  const d = r.data;
  const p = d.pedido;

  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho"><h2>Detalhes — ${esc(p.numero)}</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button></div>
    <div class="modal-corpo">
      <ul class="detalhes-lista">
        <li><strong>Item:</strong> ${esc(p.produto)}</li>
        <li><strong>Descrição do Objeto:</strong> ${esc(p.descricao_objeto || "—")}</li>
        <li><strong>Quantidade:</strong> ${esc(p.quantidade)}</li>
        <li><strong>Modalidade (RCA):</strong> ${esc(CONFIG.MODALIDADES[p.modalidade] || "—")}</li>
        <li><strong>Urgência:</strong> ${esc(CONFIG.URGENCIAS[p.urgencia] || p.urgencia)}</li>
        <li><strong>Possui cotação?:</strong> ${p.possui_cotacao ? "Sim" : "Não"}</li>
        <li><strong>Solicitante:</strong> ${esc(p.solicitante_nome)}</li>
        <li><strong>Status:</strong> <span class="tag status-${p.status}">${CONFIG.STATUS[p.status] || p.status}</span></li>
        <li><strong>Responsável:</strong> ${esc(p.responsavel_nome || "—")}</li>
        <li><strong>Data de Abertura:</strong> ${fmtDataHora(p.criado_em)}</li>
        <li><strong>Data de Envio:</strong> ${fmtDataHora(p.data_envio)}</li>
        <li><strong>Data de Encerramento:</strong> ${fmtDataHora(p.concluido_em)}</li>
        <li><strong>Lead Time:</strong> ${fmtLead(p.lead_time_dias)}</li>
        <li><strong>Retorno final:</strong> ${esc(p.retorno_final || "—")}</li>
      </ul>
      <h3 style="margin-top:1rem">Histórico</h3>
      <ul class="historico">${d.historicos.map((h) => `
        <li>
          <span class="tag status-${h.para}">${CONFIG.STATUS[h.para] || h.para}</span>
          <span>${esc(h.usuario)} · ${fmtDataHora(h.criado_em)}</span>
          ${h.observacao ? `<span class="meta">${esc(h.observacao)}</span>` : ""}
        </li>`).join("") || '<li class="meta">Sem histórico.</li>'}</ul>
      <h3 style="margin-top:1rem">Anexos</h3>
      <ul class="anexos">${d.anexos.map((a) => `
        <li>
          <span class="tag">${a.tipo === "cotacao" ? "Cotação" : "Documentação"}</span>
          ${esc(a.nome_original)} <span class="meta">(${esc(a.enviado_por)})</span>
        </li>`).join("") || '<li class="meta">Nenhum anexo.</li>'}</ul>
    </div>`);
}
