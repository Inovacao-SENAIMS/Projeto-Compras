/* views/configuracoes.js — Configurações (#/configuracoes).
 * Usuário comum: seus dados.
 * Gestão: seus dados + lista do Time (ativar/inativar/excluir).
 * SuperUsuário (grupo SuperUsuario): dados + lista de todos os usuários.
 */

ROTAS["#/configuracoes"] = async function () {
  atualizarNav("#/configuracoes");

  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="cabecalho-pagina">
      <h2><i class="bi bi-gear"></i> Configurações</h2>
    </div>
    <div class="carregando" id="cfg-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="cfg-conteudo" hidden></div>`;

  const r = await API.chamar("meusDados");
  if (!r.ok) { qs("#cfg-loading").hidden = true; mostrarMensagem("error", r.erro); return; }
  const u = r.data;

  const linhaDados = (rotulo, valor) =>
    `<li><strong>${rotulo}:</strong> ${esc(valor || "—")}</li>`;

  let html = `
    <div class="pagina-central">
    <section class="cartao-pedido">
      <h3><i class="bi bi-person-circle"></i> Meus dados</h3>
      <dl class="dados">
        <dt>Nome completo</dt><dd>${esc(u.nome_completo)}</dd>
        <dt>E-mail</dt><dd>${esc(u.email)}</dd>
        <dt>Perfil</dt><dd><span class="tag">${esc(u.grupo)}</span></dd>
        <dt>Área de atuação</dt><dd>${esc(u.area_atuacao)}</dd>
        <dt>Cargo</dt><dd>${esc(u.cargo)}</dd>
        <dt>Instituto</dt><dd>${esc(u.instituto)}</dd>
        <dt>Contato (telefone)</dt><dd>${esc(u.telefone)}</dd>
        <dt>Ramal</dt><dd>${esc(u.ramal)}</dd>
      </dl>
    </section>
    </div>`;

  /* Gestão/Super: gestão de usuários */
  if (Sessao.isGestor()) {
    html += `
    <div class="pagina-central" style="padding-top:0">
    <section class="cartao-pedido">
      <h3><i class="bi bi-people"></i> Gestão de usuários</h3>
      <div class="tabela-scroll">
        <table class="tabela" id="tbl-usuarios">
          <thead><tr>
            <th>Nome</th><th>E-mail</th><th>Perfil</th>
            <th>Situação</th><th>Ações</th>
          </tr></thead>
          <tbody id="tbl-usuarios-body"><tr><td colspan="5" class="vazio">Carregando…</td></tr></tbody>
        </table>
      </div>
    </section>
    </div>`;
  }

  qs("#cfg-conteudo").innerHTML = html;
  qs("#cfg-loading").hidden = true;
  qs("#cfg-conteudo").hidden = false;

  if (Sessao.isGestor()) await carregarUsuarios();
};

async function carregarUsuarios() {
  const r = await API.chamar("listarUsuarios");
  const tb = qs("#tbl-usuarios-body");
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="5" class="vazio">${esc(r.erro)}</td></tr>`; return; }

  const podeGerenciar = (grupo) =>
    Sessao.isGestor() && (grupo === "Time_Compras");

  tb.innerHTML = r.data.map((u) => `
    <tr>
      <td>${esc(u.nome_completo)}</td>
      <td>${esc(u.email)}</td>
      <td><span class="tag">${esc(u.grupo)}</span></td>
      <td>${u.ativo ? '<span class="tag status-concluida">Ativo</span>'
                    : '<span class="tag status-cancelada">Inativo</span>'}</td>
      <td class="acoes-tabela">
        <button type="button" class="btn-icone" data-usr="${esc(u.email)}" data-op="toggle"
                title="${u.ativo ? "Inativar" : "Ativar"}" ${podeGerenciar(u.grupo) ? "" : "disabled"}>
          <i class="bi bi-${u.ativo ? "person-dash" : "person-check"}"></i></button>
        <button type="button" class="btn-icone btn-icone-perigo" data-usr="${esc(u.email)}" data-op="excluir"
                title="Excluir" ${podeGerenciar(u.grupo) ? "" : "disabled"}>
          <i class="bi bi-trash"></i></button>
      </td>
    </tr>`).join("");

  tb.querySelectorAll("button[data-op]").forEach((b) =>
    b.addEventListener("click", async () => {
      const email = b.dataset.usr;
      const op = b.dataset.op;
      if (op === "toggle") {
        const row = r.data.find((x) => x.email === email);
        const rr = await API.chamar("alterarStatusUsuario", { email, ativo: !(row && row.ativo) });
        if (mostrarSucessoOuErro(rr)) await carregarUsuarios();
      } else if (op === "excluir") {
        if (!confirm("Excluir o usuário " + email + "?")) return;
        const rr = await API.chamar("excluirUsuario", { email });
        if (mostrarSucessoOuErro(rr)) await carregarUsuarios();
      }
    }));
}
