// Modal "Nova Requisição": abrir/fechar e anexo condicional ("Possui cotação?").
(function () {
    var modal = document.getElementById("modal-requisicao");
    if (!modal) return;

    var botaoAbrir = document.getElementById("btn-nova-requisicao");
    var grupoCotacao = document.getElementById("grupo-cotacao");
    var campoAnexo = document.getElementById("campo-anexo");

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

    // O campo de anexo só aparece quando "Possui cotação?" = Sim.
    function atualizarAnexo() {
        var marcado = grupoCotacao
            ? grupoCotacao.querySelector('input[name="possui_cotacao"]:checked')
            : null;
        var possui = marcado && marcado.value === "sim";
        campoAnexo.classList.toggle("oculto", !possui);
        if (!possui) {
            var entrada = campoAnexo.querySelector('input[type="file"]');
            if (entrada) entrada.value = "";
        }
    }

    if (grupoCotacao) {
        grupoCotacao.addEventListener("change", atualizarAnexo);
        atualizarAnexo();
    }

    // Se o POST voltou com erro de validação, reabre o modal automaticamente.
    if (modal.dataset.abrir === "1") abrir();
})();
