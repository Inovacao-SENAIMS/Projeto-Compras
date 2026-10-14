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
  setTimeout(() => { area.hidden = true; }, 5000);
}
function mostrarSucessoOuErro(resp) {
  if (resp.ok) mostrarMensagem("success", "Operação realizada com sucesso.");
  else mostrarMensagem("error", resp.erro || "Erro inesperado.");
  return resp.ok;
}

/* ---- vários ---- */
function eMailInstitucionalOk(email) {
  return new RegExp("^[^@\\s]+@[^@\\s]+" + CONFIG.DOMINIO_EMAIL.replace(".", "\\.") + "$", "i").test(email.trim());
}
function rotulo(o, dicionario) { return dicionario[o] || o || ""; }
function statusBadgeClasse(s) { return "badge badge-" + s; }
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
