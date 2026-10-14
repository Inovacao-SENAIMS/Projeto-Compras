/* views/performance.js — Performance do Time (#/performance) — Gestão.
 * Clone do equipe/performance.html: filtros de período/usuário, indicadores,
 * tabela por membro com lead time médio, gráficos e Exportar CSV.
 */

let PERF_FILTROS = { de: "", ate: "", usuario: "" };
let PERFORMANCE_OK = { de: "", ate: "", usuario: "" };

ROTAS["#/performance"] = async function () {
  if (!Sessao.isGestor()) { location.hash = "#/home"; return; }
  atualizarNav("#/performance");

  const seLeciona = PERFORMANCE_OK;
  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="cabecalho-pagina">
      <h2><i class="bi bi-graph-up-arrow"></i> Performance do Time</h2>
      <button type="button" class="botao botao-exportar" id="perf-csv"><i class="bi bi-filetype-csv"></i> Exportar CSV</button>
    </div>
    <div class="carregando"><i class="bi bi-arrow-repeat"></i> Carregando…</div>`;

  const r = await API.chamar("performance", seLeciona);
  if (!r.ok) {
    qs("#conteudo").innerHTML = `<ul class="mensagens"><li class="msg msg-error">
      <i class="bi bi-x-circle-fill"></i><span>${esc(r.erro)}</span></li></ul>`;
    return;
  }
  const d = r.data;

  const membrosOpts = d.opcoes_membros.map((m) =>
    `<option value="${esc(m.email)}" ${seLeciona.usuario === m.email ? "selected" : ""}>${esc(m.nome)}</option>`).join("");

  const tabela = d.membros.map((m) => `
    <tr>
      <td>${esc(m.nome)}</td>
      <td>${m.atribuidas}</td>
      <td>${m.em_analise}</td>
      <td>${m.concluida}</td>
      <td>${m.cancelada}</td>
      <td>${m.lead_medio == null ? "—" : m.lead_medio + " dias"}</td>
    </tr>`).join("");

  qs("#conteudo").innerHTML = `
    <div class="filtros">
      <div class="filtros-grade">
        <div class="filtro-campo">
          <label><i class="bi bi-calendar"></i> Período (abertura de/até)</label>
          <div class="filtro-duplo">
            <input type="date" id="p-de" class="campo" value="${esc(seLeciona.de)}" title="De">
            <input type="date" id="p-ate" class="campo" value="${esc(seLeciona.ate)}" title="Até">
          </div>
        </div>
        <div class="filtro-campo">
          <label for="p-usuario"><i class="bi bi-person"></i> Usuário (membro do Time)</label>
          <select id="p-usuario" class="campo">
            <option value="">Todos</option>${membrosOpts}
          </select>
        </div>
      </div>
      <div class="filtros-acoes">
        <button type="button" class="botao" id="p-filtrar"><i class="bi bi-funnel"></i> Filtrar</button>
        <a class="link-secundario" href="#/performance"><i class="bi bi-x-lg"></i> Limpar</a>
      </div>
    </div>

    <div class="dash-grade-cards">
      <div class="card-stat"><div class="card-stat-topo"><span>No período</span><i class="bi bi-clock-history"></i></div>
        <div class="card-stat-valor">${d.indicadores.total}</div></div>
      <div class="card-stat"><div class="card-stat-topo"><span>Sem responsável</span><i class="bi bi-person-dash"></i></div>
        <div class="card-stat-valor">${d.indicadores.sem_responsavel}</div></div>
      <div class="card-stat"><div class="card-stat-topo"><span>Em análise</span><i class="bi bi-hourglass-split"></i></div>
        <div class="card-stat-valor">${d.indicadores.em_analise}</div></div>
      <div class="card-stat"><div class="card-stat-topo"><span>Concluídas</span><i class="bi bi-check-circle"></i></div>
        <div class="card-stat-valor">${d.indicadores.concluida}</div></div>
      <div class="card-stat"><div class="card-stat-topo"><span>Canceladas</span><i class="bi bi-x-circle"></i></div>
        <div class="card-stat-valor">${d.indicadores.cancelada}</div></div>
    </div>

    <div class="tabela-scroll">
      <table class="tabela">
        <thead><tr>
          <th>Membro</th><th>Atribuídas</th><th>Em Análise</th>
          <th>Concluídas</th><th>Canceladas</th><th>Lead Time Médio</th>
        </tr></thead>
        <tbody>${tabela || '<tr><td colspan="6" class="vazio">Sem dados no período.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="dash-grade-2 dash-espaco-topo">
      <div class="card-grafico">
        <div class="card-grafico-cabecalho"><h3>Requisições por Status</h3></div>
        <div class="grafico-wrap"><canvas id="perf-status"></canvas></div>
      </div>
      <div class="card-grafico">
        <div class="card-grafico-cabecalho"><h3>Requisições atribuídas por membro</h3></div>
        <div class="grafico-wrap"><canvas id="perf-membro"></canvas></div>
      </div>
    </div>`;

  const azul = "#003876", azul2 = "#00529B", laranja = "#E84910";
  const paleta = [azul, azul2, laranja, "#3b76b8", "#8aa9c9", "#f2917a", "#c24a24"];

  new Chart(qs("#perf-status"), {
    type: "doughnut",
    data: {
      labels: ["Em Análise", "Concluídas", "Canceladas"],
      datasets: [{
        data: [d.indicadores.em_analise, d.indicadores.concluida, d.indicadores.cancelada],
        backgroundColor: [azul2, "#1E8E5A", "#64748B"],
      }],
    },
    options: { plugins: { legend: { position: "bottom" } } },
  });

  new Chart(qs("#perf-membro"), {
    type: "bar",
    data: {
      labels: d.membros.map((m) => m.nome),
      datasets: [{ label: "Atribuídas", data: d.membros.map((m) => m.atribuidas), backgroundColor: azul }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  qs("#p-filtrar").addEventListener("click", () => {
    PERFORMANCE_OK = { de: val("p-de"), ate: val("p-ate"), usuario: val("p-usuario") };
    ROTAS["#/performance"](); /* re-renderiza com os filtros aplicados */
  });

  qs("#perf-csv").addEventListener("click", () => {
    const cab = ["Membro", "Atribuídas", "Em Análise", "Concluídas", "Canceladas", "Lead Time Médio (dias)"];
    const lin = d.membros.map((m) => [m.nome, m.atribuidas, m.em_analise, m.concluida, m.cancelada,
      m.lead_medio == null ? "" : m.lead_medio]);
    baixarCSV("performance.csv", [cab, ...lin].map((l) => l.map(csvEsc).join(";")).join("\n"));
  });
};
