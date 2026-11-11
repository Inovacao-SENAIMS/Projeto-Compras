/* components/filtros.js */
/* Barra de filtros reutilizável (expandir/fixar/recolher) */
function inicializarBarraFiltros(opts) {
  const area = qs(opts.area);
  const btnToggle = qs(opts.toggle);
  const btnFixar = qs(opts.fixar);
  if (!area || !btnToggle || !btnFixar) return { atualizar() {} };

  let fixado = localStorage.getItem(opts.chave) === "1";
  let visivel = fixado;
  const contar = typeof opts.contar === "function" ? opts.contar : () => 0;

  function atualizar() {
    area.hidden = !visivel;

    const n = contar();
    btnToggle.innerHTML =
      `<i class="bi bi-funnel${visivel ? "-fill" : ""}"></i> ` +
      (visivel ? "Ocultar filtros" : "Mostrar filtros") +
      (n ? ` <span class="badge-filtros">${n}</span>` : "") +
      ` <i class="bi bi-chevron-${visivel ? "up" : "down"}"></i>`;

    btnFixar.innerHTML =
      `<i class="bi bi-pin-angle${fixado ? "-fill" : ""}"></i> ` +
      (fixado ? "Menu fixado" : "Fixar Menu");
    btnFixar.classList.toggle("botao-ativo", fixado);
    btnFixar.title = fixado
      ? "Clique para desafixar (a faixa volta a recolher automaticamente)"
      : "Manter a faixa de filtros sempre expandida";
  }

  btnToggle.addEventListener("click", () => {
    visivel = !visivel;
    if (!visivel) { fixado = false; localStorage.removeItem(opts.chave); }
    atualizar();
  });

  btnFixar.addEventListener("click", () => {
    fixado = !fixado;
    visivel = fixado;
    if (fixado) localStorage.setItem(opts.chave, "1");
    else localStorage.removeItem(opts.chave);
    atualizar();
  });

  atualizar();
  return { atualizar, estaVisivel: () => visivel };
}
