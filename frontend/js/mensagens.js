/* mensagens.js — mensagens (mesma aparência do Django). */
function mostrarMensagem(tipo, texto) {
  const area = qs("#mensagens-flutuantes");
  if (!area) return alert(texto || tipo);
  area.innerHTML = `<ul class="mensagens">
    <li class="msg msg-${tipo}"><i class="bi bi-${tipo === "success" ? "check-circle-fill" : tipo === "error" ? "x-circle-fill" : "exclamation-triangle-fill"}"></i><span>${esc(texto)}</span></li>
  </ul>`;
  area.hidden = false;
  setTimeout(() => { area.hidden = true; }, 4000);
}
function mostrarSucessoOuErro(resp) {
  if (resp.ok) mostrarMensagem("success", "Operação realizada com sucesso.");
  else mostrarMensagem("error", resp.erro || "Erro inesperado.");
  return resp.ok;
}
