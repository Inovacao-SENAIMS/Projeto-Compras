/* views/dashboard.js — Home (#/home). */
ROTAS["#/home"] = async function () {
  atualizarNav("#/home");
  const s = Sessao.ler();

  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="dash-cabecalho">
      <div>
        <h2><i class="bi bi-speedometer2"></i> Dashboard</h2>
        <p class="meta">${Sessao.isEquipe() ? "Histórico geral" : "Minhas requisições"} — Visão Geral.</p>
      </div>
      <a class="botao" href="#/requisicoes" style="margin-right:3.6rem;"><i class="bi bi-inboxes"></i> Ver requisições</a>
    </div>
    <div class="carregando" id="dash-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="dash-conteudo" hidden></div>`;

  const r = await API.chamar("dashboard");
  if (!r.ok) { qs("#dash-loading").hidden = true; mostrarMensagem("error", r.erro); return; }
  const DADOS = r.data || {};

  const card = (titulo, valor, icone, rodape) => `
    <div class="card-stat">
      <div class="card-stat-topo"><span>${titulo}</span><i class="bi ${icone}"></i></div>
      <div class="card-stat-valor">${valor}</div>
      <div class="card-stat-rodape">${rodape}</div>
    </div>`;

  qs("#dash-conteudo").innerHTML = `
    <div class="dash-grade">
      ${card("Total de Requisições", DADOS.total || 0, "bi-collection", "no total")}
      ${card("Pendentes", DADOS.pendentes || 0, "bi-hourglass-split", "abertas / enviadas / em análise / aberto")}
      ${card("Concluídas", DADOS.concluidas || 0, "bi-check-circle", "finalizadas")}
      ${card("Canceladas", DADOS.canceladas || 0, "bi-x-circle", "encerradas sem conclusão")}
    </div>
    <div class="dash-grade-2">
      <div class="card-grafico card-grafico-largo">
        <div class="card-grafico-cabecalho" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 id="titulo-grafico-tempo">Requisições por Dia</h3>
          <div>
            <button type="button" class="botao botao-compacto" data-modo="dia">Por Dia</button>
            <button type="button" class="botao botao-secundario botao-compacto" data-modo="mes">Por Mês</button>
          </div>
        </div>
        <div class="grafico-wrap"><canvas id="graficoMes"></canvas></div>
      </div>
      <div class="card-grafico">
        <div class="card-grafico-cabecalho"><h3>Requisições por Status</h3></div>
        <div class="grafico-wrap"><canvas id="graficoStatus"></canvas></div>
      </div>
      <div class="card-grafico">
        <div class="card-grafico-cabecalho"><h3>Requisições por Instituto</h3></div>
        <div class="grafico-wrap"><canvas id="graficoInstituto"></canvas></div>
      </div>
      <div class="card-grafico card-grafico-largo">
        <div class="card-grafico-cabecalho"><h3>Ações Rápidas</h3></div>
        <div class="acoes-rapidas">
          <a class="acao-item" href="#/requisicoes"><span class="acao-icone"><i class="bi ${Sessao.isEquipe() ? "bi-inboxes" : "bi-plus-lg"}"></i></span><span><span class="acao-titulo">${Sessao.isEquipe() ? "Ver requisições" : "Nova requisição"}</span><span class="acao-desc">${Sessao.isEquipe() ? "Acompanhar e tramitar as requisições" : "Registrar uma nova requisição de compra"}</span></span></a>
          <a class="acao-item" href="#/requisicoes"><span class="acao-icone"><i class="bi bi-list-check"></i></span><span><span class="acao-titulo">Minhas requisições</span><span class="acao-desc">Consultar e acompanhar o andamento</span></span></a>
        </div>
      </div>
    </div>`;

  qs("#dash-loading").hidden = true;
  qs("#dash-conteudo").hidden = false;
  atualizarNav("#/home");

  const azul = "#003876", azul2 = "#00529B", laranja = "#E84910";
  const paleta = [azul, azul2, laranja, "#3b76b8", "#8aa9c9", "#f2917a", "#c24a24"];

  function fonteTempo(modo) {
    if (modo === "mes") {
      return { labels: (DADOS.por_mes || []).map((m) => m.rotulo), data: (DADOS.por_mes || []).map((m) => m.total), titulo: "Requisições por Mês" };
    }
    return { labels: (DADOS.por_dia || []).map((m) => m.rotulo), data: (DADOS.por_dia || []).map((m) => m.total), titulo: "Requisições por Dia" };
  }

  let graficoMesInstance = null;
  function renderTempo(modo) {
    const info = fonteTempo(modo);
    const elTitulo = qs("#titulo-grafico-tempo");
    if (elTitulo) elTitulo.textContent = info.titulo;
    if (!(info.labels || []).length) { return; }
    if (graficoMesInstance && typeof graficoMesInstance.destroy === "function") graficoMesInstance.destroy();
    graficoMesInstance = criarGrafico("#graficoMes", {
      type: "line",
      data: { labels: info.labels, datasets: [{ label: "Requisições", data: info.data, borderColor: azul, backgroundColor: "rgba(0,56,118,.12)", tension: .35, fill: true }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    qsa("[data-modo]").forEach((b) => {
      const ativo = b.dataset.modo === modo;
      b.classList.toggle("botao-secundario", !ativo);
    });
  }
  renderTempo("dia");
  qsa("[data-modo]").forEach((b) => b.addEventListener("click", () => renderTempo(b.dataset.modo)));

  const statusKeys = Object.keys(CONFIG.STATUS);
  const statusData = statusKeys.map((k) => DADOS.por_status && DADOS.por_status[k] ? DADOS.por_status[k] : 0);
  if (statusData.some((v) => v > 0)) {
    criarGrafico("#graficoStatus", {
      type: "doughnut",
      data: { labels: statusKeys.map((k) => CONFIG.STATUS[k]), datasets: [{ data: statusData, backgroundColor: paleta }] },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 8 } }, tooltip: { enabled: true } } },
    });
  }

  const institutosLabels = (DADOS.por_instituto || []).map((x) => x.instituto);
  const institutosValores = (DADOS.por_instituto || []).map((x) => x.total);
  if (institutosValores.some((v) => v > 0)) {
    criarGrafico("#graficoInstituto", {
      type: "bar",
      data: { labels: institutosLabels, datasets: [{ label: "Requisições", data: institutosValores, backgroundColor: azul2 }] },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
};