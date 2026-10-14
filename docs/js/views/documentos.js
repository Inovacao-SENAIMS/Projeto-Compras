/* views/documentos.js — Documentos (#/documentos) — Time de Compras e Gestão.
 * Lista todos os anexos (documentação/cotação) com usuário, nº da requisição
 * e item; faixa de filtros no padrão da página Requisições; ações de
 * visualização rápida (popup) e download.
 */

let DOC_CACHE = [];
let FILTROS_DOC = {
  usuario: "", numero: "", tipo: "", status: "", envio_ini: "", envio_fim: "", nome: "",
};
let ORDENACAO_DOC = { campo: null, dir: 1 };

const CHAVE_FILTROS_DOC = "compras.filtros.fixado.documentos";

ROTAS["#/documentos"] = async function () {
  if (!Sessao.isEquipe()) { location.hash = "#/home"; return; }
  atualizarNav("#/documentos");
  ORDENACAO_DOC = { campo: null, dir: 1 };

  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="cabecalho-pagina">
      <h2><i class="bi bi-folder2-open"></i> Documentos</h2>
      <button type="button" class="botao botao-exportar" id="doc-csv">
        <i class="bi bi-filetype-csv"></i> Exportar CSV
      </button>
    </div>
    <p class="meta">Todos os documentos anexados às requisições. Consulte, visualize ou baixe.</p>
    <div class="carregando" id="doc-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="doc-conteudo" hidden></div>`;

  const r = await API.chamar("listarDocumentos");
  qs("#doc-loading").hidden = true;
  if (!r.ok) {
    qs("#doc-conteudo").hidden = false;
    qs("#doc-conteudo").innerHTML = `<ul class="mensagens"><li class="msg msg-error">
      <i class="bi bi-x-circle-fill"></i><span>${esc(r.erro)}</span></li></ul>`;
    return;
  }
  DOC_CACHE = r.data;

  /* opções derivadas dos dados */
  const usuarios = new Map();
  DOC_CACHE.forEach((d) => { if (d.enviado_por) usuarios.set(d.enviado_por_email, d.enviado_por); });

  qs("#doc-conteudo").innerHTML = `
    <div class="filtros-barra">
      <button type="button" class="botao botao-secundario botao-compacto" id="btn-toggle-filtros-doc"></button>
      <button type="button" class="botao botao-secundario botao-compacto" id="btn-fixar-filtros-doc"
              title="Manter a faixa de filtros sempre expandida"></button>
    </div>

    <div id="area-filtros-doc" hidden>
      <form class="filtros" onsubmit="return false">
        <div class="filtros-grade">
          <div class="filtro-campo">
            <label for="d-usuario"><i class="bi bi-person"></i> Usuário</label>
            <select id="d-usuario" class="campo">
              <option value="">Todos</option>
              ${[...usuarios.entries()].map(([em, n]) => `<option value="${esc(em)}">${esc(n)}</option>`).join("")}
            </select>
          </div>
          <div class="filtro-campo">
            <label for="d-numero"><i class="bi bi-hash"></i> Nº da Requisição</label>
            <input id="d-numero" class="campo" placeholder="Ex.: REQ-000001">
          </div>
          <div class="filtro-campo">
            <label for="d-tipo"><i class="bi bi-file-earmark-text"></i> Tipo</label>
            <select id="d-tipo" class="campo">
              <option value="">Todos</option>
              <option value="documentacao">Documentação</option>
              <option value="cotacao">Cotação</option>
            </select>
          </div>
          <div class="filtro-campo">
            <label for="d-status"><i class="bi bi-flag"></i> Status da requisição</label>
            <select id="d-status" class="campo">
              <option value="">Todos</option>
              ${Object.entries(CONFIG.STATUS).map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}
            </select>
          </div>
          <div class="filtro-campo">
            <label><i class="bi bi-send"></i> Envio (de/até)</label>
            <div class="filtro-duplo">
              <input type="date" id="d-envio_ini" class="campo" title="De">
              <input type="date" id="d-envio_fim" class="campo" title="Até">
            </div>
          </div>
          <div class="filtro-campo">
            <label for="d-nome"><i class="bi bi-paperclip"></i> Nome do documento</label>
            <input id="d-nome" class="campo" placeholder="parte do nome">
          </div>
        </div>
        <div class="filtros-acoes">
          <button type="button" class="botao botao-secundario" id="d-limpar" title="Limpar todos os filtros">
            <i class="bi bi-x-lg"></i> Limpar
          </button>
        </div>
      </form>
    </div>

    <div class="tabela-scroll">
      <table class="tabela" id="doc-tbl">
        <thead><tr id="doc-tbl-head"></tr></thead>
        <tbody id="doc-tbl-body"></tbody>
      </table>
      <p class="vazio" id="doc-vazio" hidden>Nenhum documento encontrado.</p>
    </div>`;

  qs("#doc-conteudo").hidden = false;

  const barra = inicializarBarraFiltros({
    area: "#area-filtros-doc",
    toggle: "#btn-toggle-filtros-doc",
    fixar: "#btn-fixar-filtros-doc",
    chave: CHAVE_FILTROS_DOC,
    contar: () => Object.keys(FILTROS_DOC).filter((k) => FILTROS_DOC[k] !== "").length,
  });

  qsa("#area-filtros-doc input, #area-filtros-doc select").forEach((el) =>
    el.addEventListener("input", () => { lerFiltros(); renderDocs(); barra.atualizar(); }));

  qs("#d-limpar").addEventListener("click", () => {
    qsa("#area-filtros-doc input, #area-filtros-doc select").forEach((el) => { el.value = ""; });
    FILTROS_DOC = { usuario: "", numero: "", tipo: "", status: "", envio_ini: "", envio_fim: "", nome: "" };
    renderDocs(); barra.atualizar();
  });

  qs("#doc-csv").addEventListener("click", exportarDocsCSV);

  lerFiltros();
  renderDocs();
};

function lerFiltros() {
  FILTROS_DOC = {
    usuario: val("d-usuario"),
    numero: val("d-numero").toLowerCase(),
    tipo: val("d-tipo"),
    status: val("d-status"),
    envio_ini: val("d-envio_ini"),
    envio_fim: val("d-envio_fim"),
    nome: val("d-nome").toLowerCase(),
  };
}

/* -------------------------------------------------- tabela */

const COLS_DOC = [
  ["usuario", "Usuário"], ["numero", "Nº da Requisição"], ["produto", "Item"],
  ["tipo", "Tipo"], ["nome", "Documento"], ["envio", "Enviado em"], [null, "Ações"],
];

function docsVisiveis() {
  const f = FILTROS_DOC;
  let ls = DOC_CACHE.filter((d) => {
    if (f.usuario && d.enviado_por_email !== f.usuario) return false;
    if (f.numero && !String(d.numero_req).toLowerCase().includes(f.numero)) return false;
    if (f.tipo && d.tipo !== f.tipo) return false;
    if (f.status && d.status !== f.status) return false;
    if (f.nome && !String(d.nome_original).toLowerCase().includes(f.nome)) return false;
    const dia = d.enviado_em ? d.enviado_em.slice(0, 10) : "";
    if (f.envio_ini && dia < f.envio_ini) return false;
    if (f.envio_fim && dia > f.envio_fim) return false;
    return true;
  });

  if (ORDENACAO_DOC.campo) {
    const c = ORDENACAO_DOC.campo;
    ls = ls.slice().sort((a, b) => {
      const va = c === "envio" ? a.enviado_em : c === "tipo" ? a.tipo : c === "usuario" ? a.enviado_por
        : c === "numero" ? a.numero_req : c === "nome" ? a.nome_original : a.produto;
      const vb = c === "envio" ? b.enviado_em : c === "tipo" ? b.tipo : c === "usuario" ? b.enviado_por
        : c === "numero" ? b.numero_req : c === "nome" ? b.nome_original : b.produto;
      return String(va || "").localeCompare(String(vb || "")) * ORDENACAO_DOC.dir;
    });
  }
  return ls;
}

function renderDocs() {
  qs("#doc-tbl-head").innerHTML = COLS_DOC.map(([c, n]) =>
    c ? `<th class="th-ordenar" data-campo="${c}">${n}${ORDENACAO_DOC.campo === c ? (ORDENACAO_DOC.dir > 0 ? " ▲" : " ▼") : ""}</th>`
      : `<th>${n}</th>`).join("");

  qsa("#doc-tbl-head .th-ordenar").forEach((th) => th.addEventListener("click", () => {
    const c = th.dataset.campo;
    if (ORDENACAO_DOC.campo === c) ORDENACAO_DOC.dir *= -1;
    else { ORDENACAO_DOC.campo = c; ORDENACAO_DOC.dir = 1; }
    renderDocs();
  }));

  const ls = docsVisiveis();
  qs("#doc-vazio").hidden = ls.length > 0;
  qs("#doc-tbl-body").innerHTML = ls.map((d) => `
    <tr>
      <td>${esc(d.enviado_por)}</td>
      <td>${esc(d.numero_req)}</td>
      <td><span class="celula-truncada" title="${esc(d.produto)}">${esc(d.produto)}</span></td>
      <td><span class="tag">${d.tipo === "cotacao" ? "Cotação" : "Documentação"}</span></td>
      <td><span class="celula-truncada" title="${esc(d.nome_original)}">${esc(d.nome_original)}</span></td>
      <td>${fmtDataHora(d.enviado_em)}</td>
      <td class="acoes-tabela">
        <button type="button" class="btn-icone" data-doc-ver="${esc(d.id)}" title="Visualizar documento">
          <i class="bi bi-eye"></i></button>
        <button type="button" class="btn-icone" data-doc-baixar="${esc(d.id)}" title="Baixar documento">
          <i class="bi bi-download"></i></button>
      </td>
    </tr>`).join("");
}

/* -------------------------------------------------- ações: ver / baixar */

document.addEventListener("click", async (e) => {
  const ver = e.target.closest("[data-doc-ver]");
  const baixar = e.target.closest("[data-doc-baixar]");
  if (!ver && !baixar) return;

  const id = (ver || baixar).dataset[ver ? "docVer" : "docBaixar"];
  const doc = DOC_CACHE.find((d) => d.id === id) || {};

  const r = await API.chamar("baixarArquivo", { id });
  if (!r.ok) { mostrarMensagem("error", r.erro); return; }

  if (baixar) { baixarArquivo(r.data.base64, r.data.mime, r.data.nome); return; }
  visualizarDocumento(doc, r.data);
});

function baixarArquivo(base64, mime, nome) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = nome;
  a.click();
}

function visualizarDocumento(doc, arquivo) {
  const mime = String(arquivo.mime || "");
  const b64 = arquivo.base64;
  let corpo;

  if (/^image\//.test(mime)) {
    corpo = `<img class="doc-preview-img" src="data:${mime};base64,${b64}" alt="${esc(arquivo.nome)}">`;
  } else if (/pdf/i.test(mime) || /\.pdf$/i.test(arquivo.nome)) {
    corpo = `<iframe class="doc-preview-pdf" src="data:application/pdf;base64,${b64}" title="${esc(arquivo.nome)}"></iframe>`;
  } else {
    corpo = `<div class="doc-preview-indisponivel">
      <i class="bi bi-file-earmark"></i>
      <p class="meta">Pré-visualização não disponível para este formato (${esc(mime || "desconhecido")}).</p>
    </div>`;
  }

  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho">
      <h2><i class="bi bi-eye"></i> ${esc(arquivo.nome)}</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button>
    </div>
    <div class="modal-corpo">
      <dl class="dados doc-meta">
        <dt>Requisição</dt><dd>${esc(doc.numero_req || "—")}</dd>
        <dt>Item</dt><dd>${esc(doc.produto || "—")}</dd>
        <dt>Enviado por</dt><dd>${esc(doc.enviado_por || "—")}</dd>
        <dt>Tipo</dt><dd>${doc.tipo === "cotacao" ? "Cotação" : "Documentação"}</dd>
      </dl>
      ${corpo}
      <div class="modal-acoes">
        <button type="button" class="botao" id="dp-baixar"><i class="bi bi-download"></i> Baixar</button>
        <button type="button" class="botao botao-cancelar" data-fechar>Fechar</button>
      </div>
    </div>`, "modal-largo");

  const btn = overlay.querySelector("#dp-baixar");
  if (btn) btn.addEventListener("click", () => baixarArquivo(arquivo.base64, arquivo.mime, arquivo.nome));
}

/* -------------------------------------------------- CSV */

function exportarDocsCSV() {
  const ls = docsVisiveis();
  const cab = ["Usuário", "Nº da Requisição", "Item", "Tipo", "Documento", "Enviado em"];
  const lin = ls.map((d) => [
    d.enviado_por, d.numero_req, d.produto,
    d.tipo === "cotacao" ? "Cotação" : "Documentação",
    d.nome_original, fmtDataHora(d.enviado_em),
  ]);
  baixarCSV("documentos.csv", [cab, ...lin].map((l) => l.map(csvEsc).join(";")).join("\n"));
}
