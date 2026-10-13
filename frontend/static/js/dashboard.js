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
                    borderColor: "#003876",
                    backgroundColor: "rgba(0, 56, 118, 0.12)",
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

    var elInstituto = document.getElementById("dados-instituto");
    var canvasInstituto = document.getElementById("graficoInstituto");
    if (canvasInstituto && elInstituto) {
        var dadosInstituto = JSON.parse(elInstituto.textContent);
        new Chart(canvasInstituto, {
            type: "bar",
            data: {
                labels: dadosInstituto.labels,
                datasets: [{
                    label: "Requisições",
                    data: dadosInstituto.valores,
                    backgroundColor: ["#E84910", "#003876", "#00529B", "#94a3b8"],
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
                },
            },
        });
    }
})();
