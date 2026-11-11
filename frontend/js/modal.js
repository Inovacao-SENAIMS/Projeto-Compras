/* modal.js — modal de confirmação. */
function confirmarModal(mensagem, titulo) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay aberto";
    overlay.innerHTML = `
      <div class="modal modal-confirmacao" role="dialog" aria-modal="true">
        <div class="modal-cabecalho">
          <h3>${esc(titulo || "Confirmação")}</h3>
          <button type="button" class="modal-fechar" data-fechar aria-label="Fechar">&times;</button>
        </div>
        <div class="modal-corpo">
          <p class="modal-mensagem">${esc(mensagem)}</p>
          <div class="modal-acoes">
            <button type="button" class="botao" id="cm-confirmar"><i class="bi bi-check-lg"></i> Confirmar</button>
            <button type="button" class="botao botao-cancelar" id="cm-cancelar">Cancelar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let resolvido = false;
    const fechar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      overlay.remove();
      resolve(valor);
    };

    overlay.querySelector("#cm-confirmar").addEventListener("click", () => fechar(true));
    overlay.querySelector("#cm-cancelar").addEventListener("click", () => fechar(false));
    overlay.querySelector("[data-fechar]").addEventListener("click", () => fechar(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(false); });
    document.addEventListener("keydown", function aoTeclar(ev) {
      if (ev.key === "Escape") { document.removeEventListener("keydown", aoTeclar); fechar(false); }
    });
  });
}
