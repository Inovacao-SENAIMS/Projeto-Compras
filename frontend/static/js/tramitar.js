// Página de tramitação: botão "Editar" revela os campos; retorno final só ao concluir.
(function () {
    var botao = document.getElementById("btn-editar");
    var area = document.getElementById("area-editar");
    if (botao && area) {
        botao.addEventListener("click", function () {
            area.classList.remove("oculto");
            botao.classList.add("oculto");
            var alvo = area.querySelector("select, textarea, input");
            if (alvo) alvo.focus();
        });
    }

    var selectStatus = document.querySelector('#area-editar select[name="status"]');
    var campoRetorno = document.getElementById("campo-retorno");

    function atualizarRetorno() {
        if (!selectStatus || !campoRetorno) return;
        campoRetorno.classList.toggle("oculto", selectStatus.value !== "concluida");
    }

    if (selectStatus) {
        selectStatus.addEventListener("change", atualizarRetorno);
        atualizarRetorno();
    }
})();
