/* validacao.js — validações utilitárias. */
function eMailInstitucionalOk(email) {
  const dominio = CONFIG.DOMINIO_EMAIL.replace(/\./g, "\\.");
  return new RegExp("^[^@\\s]+" + dominio + "$", "i").test(String(email || "").trim());
}
function rotulo(o, dicionario) { return dicionario[o] || o || ""; }
function statusBadgeClasse(s) { return "badge badge-" + s; }
