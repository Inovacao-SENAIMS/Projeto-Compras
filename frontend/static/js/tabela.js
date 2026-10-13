// Modais das tabelas: anexos (popup) e designar/alterar responsável (Gestão).
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

    // --- Modal de designar/alterar responsável ---
    var modalDesignar = document.getElementById("modal-designar");
    if (modalDesignar) {
        var form = document.getElementById("form-designar");
        document.querySelectorAll("[data-designar-url]").forEach(function (botao) {
            botao.addEventListener("click", function () {
                form.setAttribute("action", botao.getAttribute("data-designar-url"));
                modalDesignar.classList.add("aberto");
            });
        });
        ligarFechamento(modalDesignar);
    }

    // --- Confirmação antes de designar (tabela e detalhe) ---
    document.querySelectorAll("form[data-confirm]").forEach(function (form) {
        form.addEventListener("submit", function (evento) {
            var nome = evento.submitter ? evento.submitter.textContent.trim() : "";
            var msg = nome
                ? "Confirmar designação de: " + nome + "?"
                : "Confirmar designação do responsável?";
            if (!window.confirm(msg)) {
                evento.preventDefault();
            }
        });
    });
})();
