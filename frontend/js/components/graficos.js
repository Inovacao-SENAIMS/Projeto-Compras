/* components/graficos.js */
function criarGrafico(idOuEl, config) {
  const el = typeof idOuEl === "string" ? qs(idOuEl) : idOuEl;
  if (!el || typeof Chart === "undefined") return null;
  try {
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
