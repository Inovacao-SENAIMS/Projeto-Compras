/* views/configuracoes.js — Configurações (#/configuracoes).
 * Usuário comum: seus dados.
 * Gestão: seus dados + atalho para a página de Usuários (gestão de pessoas).
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
    </section>`;

  if (Sessao.isGestor()) {
    html += `
    <section class="cartao-pedido" style="margin-top:1rem">
      <h3><i class="bi bi-people"></i> Gestão de pessoas</h3>
      <p class="meta">Visualize todos os usuários, altere o perfil, ative/inative, inclua ou exclua.</p>
      <a class="botao" href="#/usuarios"><i class="bi bi-people"></i> Abrir Usuários</a>
    </section>`;
  }

  html += `
    <section class="cartao-pedido" style="margin-top:1rem">
      <h3><i class="bi bi-key"></i> Alterar senha</h3>
      <p class="meta">Defina uma nova senha para sua conta.</p>
      <form id="cfg-senha" class="formulario">
        <p><label for="cfg-senha-atual">Senha atual</label>
           <input id="cfg-senha-atual" type="password" class="campo" required></p>
        <p><label for="cfg-senha-nova">Nova senha</label>
           <input id="cfg-senha-nova" type="password" class="campo" required></p>
        <p><label for="cfg-senha-nova2">Confirmar nova senha</label>
           <input id="cfg-senha-nova2" type="password" class="campo" required></p>
        <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Alterar senha</button>
      </form>
    </section>`;

  html += `</div>`;

  qs("#cfg-conteudo").innerHTML = html;
  qs("#cfg-loading").hidden = true;
  qs("#cfg-conteudo").hidden = false;

  const formSenha = qs("#cfg-senha");
  if (formSenha) {
    formSenha.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const res = await API.chamar("alterarSenha", {
        senha_atual: val("cfg-senha-atual"),
        senha_nova: val("cfg-senha-nova"),
        senha_nova2: val("cfg-senha-nova2"),
      });
      if (res.ok) {
        mostrarMensagem("success", "Senha alterada com sucesso. Faça login novamente.");
        formSenha.reset();
        Sessao.limpar();
        setTimeout(() => (location.hash = "#/login"), 1200);
      } else {
        mostrarMensagem("error", res.erro || "Não foi possível alterar a senha.");
      }
    });
  }
};