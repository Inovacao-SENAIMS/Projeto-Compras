/* format.js — formatação compartilhada. */
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
