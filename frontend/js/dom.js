/* dom.js — helpers de DOM. */
function qs(sel, escopo) { return (escopo || document).querySelector(sel); }
function qsa(sel, escopo) { return Array.from((escopo || document).querySelectorAll(sel)); }
function esc(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function val(id) { const el = qs("#" + id); return el ? el.value.trim() : ""; }
