// Modal "Nova Requisição": abrir/fechar e campo de cotação condicional.
(function () {
    var modal = document.getElementById("modal-requisicao");
    if (!modal) return;

    var botaoAbrir = document.getElementById("btn-nova-requisicao");
    var grupoCotacao = document.getElementById("grupo-cotacao");
    var campoCotacao = document.getElementById("campo-cotacao");

    function abrir() {
        modal.classList.add("aberto");
    }

    function fechar() {
        modal.classList.remove("aberto");
    }

    if (botaoAbrir) botaoAbrir.addEventListener("click", abrir);

    // Fecha por botão "X"/"Cancelar" e por clique fora da caixa (overlay).
    modal.querySelectorAll("[data-fechar]").forEach(function (el) {
        el.addEventListener("click", fechar);
    });
    modal.addEventListener("click", function (evento) {
        if (evento.target === modal) fechar();
    });
    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") fechar();
    });

    // O campo de anexo da COTAÇÃO só aparece quando "Possui cotação?" = Sim.
    function atualizarCotacao() {
        var marcado = grupoCotacao
            ? grupoCotacao.querySelector('input[name="possui_cotacao"]:checked')
            : null;
        var sim = marcado && marcado.value === "sim";
        if (campoCotacao) campoCotacao.classList.toggle("oculto", !sim);
    }

    if (grupoCotacao) {
        grupoCotacao.addEventListener("change", atualizarCotacao);
        atualizarCotacao();
    }

    // Se o POST voltou com erro de validação, reabre o modal automaticamente.
    if (modal.dataset.abrir === "1") abrir();
})();
