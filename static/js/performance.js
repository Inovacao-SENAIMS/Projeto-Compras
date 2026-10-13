// Gráficos da página de performance do time (Chart.js).
(function () {
    if (!window.Chart) return;

    // Por membro (barras)
    var elMembros = document.getElementById("dados-membros");
    var canvasMembros = document.getElementById("graficoMembros");
    if (elMembros && canvasMembros) {
        var dados = JSON.parse(elMembros.textContent);
        new Chart(canvasMembros, {
            type: "bar",
            data: {
                labels: dados.labels,
                datasets: [{
                    label: "Atribuídas",
                    data: dados.valores,
                    backgroundColor: "#00529B",
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { autoSkip: false, maxRotation: 30, minRotation: 0 } },
                },
            },
        });
    }

    // Por status (rosca)
    var elStatus = document.getElementById("dados-status-perf");
    var canvasStatus = document.getElementById("graficoStatusPerf");
    if (elStatus && canvasStatus) {
        var status = JSON.parse(elStatus.textContent);
        new Chart(canvasStatus, {
            type: "doughnut",
            data: {
                labels: status.map(function (i) { return i[0]; }),
                datasets: [{
                    data: status.map(function (i) { return i[1]; }),
                    backgroundColor: status.map(function (i) { return i[2]; }),
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
                },
            },
        });
    }
})();
