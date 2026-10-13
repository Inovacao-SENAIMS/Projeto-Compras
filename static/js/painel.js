// Modal "Nova Requisição": abrir/fechar.
(function () {
    var modal = document.getElementById("modal-requisicao");
    if (!modal) return;

    var botaoAbrir = document.getElementById("btn-nova-requisicao");

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

    // Se o POST voltou com erro de validação, reabre o modal automaticamente.
    if (modal.dataset.abrir === "1") abrir();
})();
