// Gráficos do dashboard da Home (Chart.js).
(function () {
    if (!window.Chart) return;

    var elMes = document.getElementById("dados-mes");
    var elStatus = document.getElementById("dados-status");

    var canvasMes = document.getElementById("graficoMes");
    if (canvasMes && elMes) {
        var dadosMes = JSON.parse(elMes.textContent);
        new Chart(canvasMes, {
            type: "line",
            data: {
                labels: dadosMes.labels,
                datasets: [{
                    label: "Requisições",
                    data: dadosMes.valores,
                    borderColor: "#0d3b66",
                    backgroundColor: "rgba(13, 59, 102, 0.12)",
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });
    }

    var canvasStatus = document.getElementById("graficoStatus");
    if (canvasStatus && elStatus) {
        var dadosStatus = JSON.parse(elStatus.textContent);
        new Chart(canvasStatus, {
            type: "doughnut",
            data: {
                labels: dadosStatus.map(function (item) { return item[0]; }),
                datasets: [{
                    data: dadosStatus.map(function (item) { return item[1]; }),
                    backgroundColor: dadosStatus.map(function (item) { return item[2]; }),
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
