/* util.js — helpers compartilhados (formatação, dom, validação). */

/* ---- formatação (mesmas regras visuais do Django: dd/mm/aaaa - HH:MM) ---- */
function fmtDataHora(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return valor;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} - ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtData(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return valor;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtNumeroReq(n) { return n || "—"; }
function fmtLead(dias) {
  if (dias === null || dias === undefined || dias === "") return "";
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/* ---- dom ---- */
function qs(sel, escopo) { return (escopo || document).querySelector(sel); }
function qsa(sel, escopo) { return Array.from((escopo || document).querySelectorAll(sel)); }
function esc(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function val(id) { const el = qs("#" + id); return el ? el.value.trim() : ""; }

/* ---- mensagens (mesma aparência das "mensagens" do Django) ---- */
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

/* ---- vários ---- */
function eMailInstitucionalOk(email) {
  const dominio = CONFIG.DOMINIO_EMAIL.replace(/\./g, "\\.");
  return new RegExp("^[^@\\s]+" + dominio + "$", "i").test(String(email || "").trim());
}
function rotulo(o, dicionario) { return dicionario[o] || o || ""; }
function statusBadgeClasse(s) { return "badge badge-" + s; }
function confirmarModal(mensagem, titulo) {
  /* Confirmação própria, centralizada (substitui o confirm() nativo, que o
   * navegador posiciona fora do centro). Resolve true/false. */
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

function baixarCSV(nome, conteudo) {
  const blob = new Blob(["\ufeff" + conteudo], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function csvEsc(v) {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* hash SHA-256 (client, para paridade com o salt server-side na opção (a))
 * Nota: o server é fonte de verdade; o client nunca precisa hashear. */
