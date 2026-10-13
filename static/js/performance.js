// Gráfico da página de performance do time (Chart.js).
(function () {
    if (!window.Chart) return;

    var el = document.getElementById("dados-membros");
    var canvas = document.getElementById("graficoMembros");
    if (!el || !canvas) return;

    var dados = JSON.parse(el.textContent);
    new Chart(canvas, {
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
})();
