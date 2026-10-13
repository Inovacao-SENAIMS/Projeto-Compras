// Modais das tabelas: anexos (popup) e designar responsável (Gestão).
(function () {
    function ligarFechamento(modal) {
        modal.querySelectorAll("[data-fechar]").forEach(function (el) {
            el.addEventListener("click", function () {
                modal.classList.remove("aberto");
            });
        });
        modal.addEventListener("click", function (evento) {
            if (evento.target === modal) modal.classList.remove("aberto");
        });
    }

    document.addEventListener("keydown", function (evento) {
        if (evento.key !== "Escape") return;
        document.querySelectorAll(".modal-overlay.aberto").forEach(function (m) {
            m.classList.remove("aberto");
        });
    });

    // --- Modal de anexos ---
    var modalAnexos = document.getElementById("modal-anexos");
    if (modalAnexos) {
        var corpo = document.getElementById("modal-anexos-corpo");
        document.querySelectorAll("[data-anexos]").forEach(function (botao) {
            botao.addEventListener("click", function () {
                var origem = document.getElementById(botao.getAttribute("data-anexos"));
                corpo.innerHTML = origem ? origem.innerHTML : '<p class="meta">Sem anexos.</p>';
                modalAnexos.classList.add("aberto");
            });
        });
        ligarFechamento(modalAnexos);
    }

    // --- Modal de designar responsável ---
    var modalDesignar = document.getElementById("modal-designar");
    if (modalDesignar) {
        var form = document.getElementById("form-designar");
        var select = document.getElementById("id_responsavel_modal");
        document.querySelectorAll("[data-designar-url]").forEach(function (botao) {
            botao.addEventListener("click", function () {
                form.setAttribute("action", botao.getAttribute("data-designar-url"));
                select.value = botao.getAttribute("data-responsavel-atual") || "";
                modalDesignar.classList.add("aberto");
            });
        });
        ligarFechamento(modalDesignar);
    }
})();
