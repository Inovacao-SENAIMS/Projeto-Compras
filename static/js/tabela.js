// Modal de anexos das tabelas (popup com a lista de anexos da requisição).
(function () {
    var modal = document.getElementById("modal-anexos");
    if (!modal) return;

    var corpo = document.getElementById("modal-anexos-corpo");

    function abrir(idOrigem) {
        var origem = document.getElementById(idOrigem);
        corpo.innerHTML = origem ? origem.innerHTML : '<p class="meta">Sem anexos.</p>';
        modal.classList.add("aberto");
    }

    function fechar() {
        modal.classList.remove("aberto");
    }

    document.querySelectorAll("[data-anexos]").forEach(function (botao) {
        botao.addEventListener("click", function () {
            abrir(botao.getAttribute("data-anexos"));
        });
    });

    modal.querySelectorAll("[data-fechar]").forEach(function (el) {
        el.addEventListener("click", fechar);
    });
    modal.addEventListener("click", function (evento) {
        if (evento.target === modal) fechar();
    });
    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") fechar();
    });
})();
