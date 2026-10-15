/* views/dashboard.js — Home (#/home), clone do core/dashboard.html.
 * Classes: .dash-cabecalho/.dash-grade/.card-stat/.dash-grade-2/.card-grafico...
 * Gráficos em Chart.js (mesmos IDs de canvas: graficoMes/graficoStatus/graficoInstituto).
 */

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
      <a class="botao" href="#/requisicoes"><i class="bi bi-inboxes"></i> Ver requisições</a>
    </div>

    <div class="carregando" id="dash-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="dash-conteudo" hidden></div>`;

  const r = await API.chamar("dashboard");
  if (!r.ok) { qs("#dash-loading").hidden = true; mostrarMensagem("error", r.erro); return; }
  const d = r.data;

  const card = (titulo, valor, icone, rodape) => `
    <div class="card-stat">
      <div class="card-stat-topo"><span>${titulo}</span><i class="bi ${icone}"></i></div>
      <div class="card-stat-valor">${valor}</div>
      <div class="card-stat-rodape">${rodape}</div>
    </div>`;

  qs("#dash-conteudo").innerHTML = `
    <div class="dash-grade">
      ${card("Total de Requisições", d.total, "bi-collection", "no total")}
      ${card("Pendentes", d.pendentes, "bi-hourglass-split", "abertas / enviadas / em análise")}
      ${card("Concluídas", d.concluidas, "bi-check-circle", "finalizadas")}
      ${card("Canceladas", d.canceladas, "bi-x-circle", "encerradas sem conclusão")}
    </div>
    <div class="dash-grade-2">
      <div class="card-grafico card-grafico-largo">
        <div class="card-grafico-cabecalho" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h3 id="titulo-grafico-tempo">Requisições por Dia</h3>
          <div>
            <button type="button" class="botao botao-compacto" data-modo="dia">Por Dia</button>
            <button type="button" class="botao botao-secundario botao-compacto" data-modo="semana">Por Dia da Semana</button>
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
          <a class="acao-item" href="#/requisicoes">
            <span class="acao-icone"><i class="bi ${Sessao.isEquipe() ? "bi-inboxes" : "bi-plus-lg"}"></i></span>
            <span><span class="acao-titulo">${Sessao.isEquipe() ? "Ver requisições" : "Nova requisição"}</span>
            <span class="acao-desc">${Sessao.isEquipe() ? "Acompanhar e tramitar as requisições" : "Registrar uma nova requisição de compra"}</span></span>
          </a>
          <a class="acao-item" href="#/requisicoes">
            <span class="acao-icone"><i class="bi bi-list-check"></i></span>
            <span><span class="acao-titulo">Minhas requisições</span>
            <span class="acao-desc">Consultar e acompanhar o andamento</span></span>
          </a>

        </div>
      </div>
    </div>`;

  qs("#dash-loading").hidden = true;
  qs("#dash-conteudo").hidden = false;
  atualizarNav("#/home");

  /* paleta SENAI */
  const azul = "#003876", azul2 = "#00529B", laranja = "#E84910";
  const paleta = [azul, azul2, laranja, "#3b76b8", "#8aa9c9", "#f2917a", "#c24a24"];

  const chaves = Object.keys(CONFIG.STATUS);
  function rotulosTempo(modo) {
    if (modo === "semana") return { labels: (d.por_semana||[]).map((x)=>x.rotulo), data: (d.por_semana||[]).map((x)=>x.total), titulo: "Requisicoes por Dia da Semana" };
    if (modo === "mes") return { labels: d.por_mes.map((m)=>m.rotulo), data: d.por_mes.map((m)=>m.total), titulo: "Requisicoes por Mes" };
    return { labels: (d.por_dia||[]).map((x)=>x.rotulo), data: (d.por_dia||[]).map((x)=>x.total), titulo: "Requisicoes por Dia" };
  }

  let graficoMesInstance = null;
  function renderGraficoTempo(modo) {
    const info = rotulosTempo(modo);
    qs("#titulo-grafico-tempo").textContent = info.titulo;
    if (graficoMesInstance) { graficoMesInstance.destroy(); }
    graficoMesInstance = criarGrafico("#graficoMes", {
      type: "bar",
      data: { labels: info.labels, datasets: [{ label: "Requisicoes", data: info.data, backgroundColor: azul }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    qsa("[data-modo]").forEach((b) => {
      const ativo = b.dataset.modo === modo;
      b.classList.toggle("botao-secundario", !ativo);
    });
  }
  renderGraficoTempo("dia");
  qsa("[data-modo]").forEach((b) => b.addEventListener("click", () => renderGraficoTempo(b.dataset.modo)));

  criarGrafico("#graficoStatus", {
    type: "doughnut",
    data: {
      labels: chaves.map((k) => CONFIG.STATUS[k]),
      datasets: [{ data: chaves.map((k) => d.por_status[k] || 0), backgroundColor: paleta }],
    },
    options: {
      cutout: "55%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 8 } },
        tooltip: { enabled: true },
      },
    },
  });

  criarGrafico("#graficoInstituto", {
    type: "bar",
    data: {
      labels: d.por_instituto.map((x) => x.instituto),
      datasets: [{ label: "Requisicoes", data: d.por_instituto.map((x) => x.total), backgroundColor: azul2 }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false }, datalabels: { anchor: "end", align: "right" } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
};
