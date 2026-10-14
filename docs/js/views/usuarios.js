/* views/usuarios.js — Administração de Usuários (#/usuarios) — EXCLUSIVA da Gestão.
 * Recursos: listar todos, alterar perfil (grupo) inline, ativar/inativar,
 * excluir e incluir usuário por popup (formulário rápido).
 */

const GRUPOS_ROTULO = {
  UserISI_IST: "Solicitante",
  Time_Compras: "Time de Compras",
  Manager_Compras: "Gestão",
  SuperUsuario: "SuperUsuário",
};

let USU_CACHE = [];

ROTAS["#/usuarios"] = async function () {
  if (!Sessao.isGestor()) { location.hash = "#/home"; return; }
  atualizarNav("#/usuarios");

  qs("#conteudo").innerHTML = `
    <div id="mensagens-flutuantes" hidden></div>
    <div class="cabecalho-pagina">
      <h2><i class="bi bi-people"></i> Usuários</h2>
      <button type="button" class="botao" id="btn-novo-usuario"><i class="bi bi-person-plus"></i> Novo Usuário</button>
    </div>
    <p class="meta">Todos os usuários cadastrados. Altere o perfil, ative/inative, exclua ou inclua novos.</p>
    <div class="carregando" id="usu-loading"><i class="bi bi-arrow-repeat"></i> Carregando…</div>
    <div id="usu-conteudo" hidden></div>`;

  qs("#btn-novo-usuario").addEventListener("click", modalNovoUsuario);

  await carregar();

  function render() {
    const linhas = USU_CACHE.map((u) => {
      const opcoes = Object.keys(GRUPOS_ROTULO)
        .filter((g) => g !== "SuperUsuario")
        .map((g) => `<option value="${g}" ${u.grupo === g ? "selected" : ""}>${GRUPOS_ROTULO[g]}</option>`)
        .join("");
      return `
      <tr>
        <td>${esc(u.nome_completo)}${u.sou_eu ? ' <span class="tag">você</span>' : ""}</td>
        <td>${esc(u.email)}</td>
        <td>
          <select class="campo selecao-perfil" data-usuario="${esc(u.email)}" ${u.sou_eu ? "disabled" : ""}>
            ${opcoes}
          </select>
        </td>
        <td>${u.ativo ? '<span class="tag status-concluida">Ativo</span>'
                      : '<span class="tag status-cancelada">Inativo</span>'}</td>
        <td class="acoes-tabela">
          <button type="button" class="btn-icone" data-usuario="${esc(u.email)}" data-op="toggle"
                  title="${u.ativo ? "Inativar" : "Ativar"}" ${u.sou_eu ? "disabled" : ""}>
            <i class="bi bi-${u.ativo ? "person-dash" : "person-check"}"></i></button>
          <button type="button" class="btn-icone btn-icone-perigo" data-usuario="${esc(u.email)}" data-op="excluir"
                  title="Excluir" ${u.sou_eu ? "disabled" : ""}>
            <i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join("");

    qs("#usu-conteudo").innerHTML = `
      <div class="tabela-scroll">
        <table class="tabela">
          <thead><tr>
            <th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ações</th>
          </tr></thead>
          <tbody>${linhas || '<tr><td colspan="5" class="vazio">Nenhum usuário.</td></tr>'}</tbody>
        </table>
      </div>`;

    /* troca de perfil ao mudar o select */
    qsa(".selecao-perfil").forEach((sel) => sel.addEventListener("change", async () => {
      const email = sel.dataset.usuario;
      const grupoNovo = sel.value;
      const nome = GRUPOS_ROTULO[grupoNovo] || grupoNovo;
      if (!confirm("Alterar o perfil de " + email + " para " + nome + "?")) { sel.value = grupoAtual(email); return; }
      const r = await API.chamar("alterarGrupoUsuario", { email, grupo: grupoNovo });
      if (mostrarSucessoOuErro(r)) await carregar();
      else sel.value = grupoAtual(email);
    }));

    /* ativar/inativar e excluir */
    qsa('#usu-conteudo button[data-op]').forEach((b) => b.addEventListener("click", async () => {
      const email = b.dataset.usuario;
      const op = b.dataset.op;
      if (op === "toggle") {
        const u = USU_CACHE.find((x) => x.email === email);
        const r = await API.chamar("alterarStatusUsuario", { email, ativo: !(u && u.ativo) });
        if (mostrarSucessoOuErro(r)) await carregar();
      } else if (op === "excluir") {
        if (!confirm("Excluir o usuário " + email + "? Esta ação não pode ser desfeita.")) return;
        const r = await API.chamar("excluirUsuario", { email });
        if (mostrarSucessoOuErro(r)) await carregar();
      }
    }));
  }

  function grupoAtual(email) {
    const u = USU_CACHE.find((x) => x.email === email);
    return u ? u.grupo : "UserISI_IST";
  }

  async function carregar() {
    const r = await API.chamar("listarUsuarios");
    qs("#usu-loading").hidden = true;
    if (!r.ok) {
      qs("#usu-conteudo").hidden = false;
      qs("#usu-conteudo").innerHTML = `<ul class="mensagens"><li class="msg msg-error">
        <i class="bi bi-x-circle-fill"></i><span>${esc(r.erro)}</span></li></ul>`;
      return;
    }
    USU_CACHE = r.data;
    qs("#usu-conteudo").hidden = false;
    render();
  }
};

/* -------------------------------------------------- modal: novo usuário */
function modalNovoUsuario() {
  const perfis = ["UserISI_IST", "Time_Compras", "Manager_Compras"]
    .map((g) => `<option value="${g}">${GRUPOS_ROTULO[g]}</option>`).join("");
  const institutos = CONFIG.INSTITUTOS.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join("");

  const overlay = abrirModalHTML(`
    <div class="modal-cabecalho"><h2>Novo Usuário</h2>
      <button type="button" class="modal-fechar" data-fechar>&times;</button></div>
    <div class="modal-corpo">
      <form id="form-novo-usuario" class="formulario">
        <div class="campo-duplo">
          <p><label for="nu-nome">Nome completo</label>
            <input id="nu-nome" class="campo" required></p>
          <p><label for="nu-email">E-mail institucional</label>
            <input id="nu-email" class="campo" placeholder="nome@ms.senai.br" required></p>
        </div>
        <div class="campo-duplo">
          <p><label for="nu-grupo">Perfil</label>
            <select id="nu-grupo" class="campo">${perfis}</select></p>
          <p><label for="nu-senha">Senha provisória</label>
            <input id="nu-senha" type="text" class="campo" value="Compras@2026" required></p>
        </div>
        <div class="campo-duplo">
          <p><label for="nu-area">Área de atuação</label>
            <input id="nu-area" class="campo"></p>
          <p><label for="nu-cargo">Cargo</label>
            <input id="nu-cargo" class="campo"></p>
        </div>
        <p>
          <label for="nu-instituto">Instituto</label>
          <select id="nu-instituto" class="campo">${institutos}</select>
        </p>
        <div class="campo-duplo">
          <p><label for="nu-telefone">Contato (telefone)</label>
            <input id="nu-telefone" class="campo"></p>
          <p><label for="nu-ramal">Ramal</label>
            <input id="nu-ramal" class="campo"></p>
        </div>
        <div class="modal-acoes">
          <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Cadastrar</button>
          <button type="button" class="link-secundario" data-fechar>Cancelar</button>
        </div>
      </form>
    </div>`);

  overlay.querySelector("#form-novo-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = overlay.querySelector("#nu-email").value.trim();
    if (!eMailInstitucionalOk(email)) { mostrarMensagem("error", "Só é aceito e-mail institucional @ms.senai.br."); return; }

    const btn = overlay.querySelector('button[type="submit"]');
    btn.disabled = true; const rot = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cadastrando…';

    const r = await API.chamar("criarUsuarioAdmin", {
      nome_completo: overlay.querySelector("#nu-nome").value.trim(),
      email,
      grupo: overlay.querySelector("#nu-grupo").value,
      senha: overlay.querySelector("#nu-senha").value,
      area_atuacao: overlay.querySelector("#nu-area").value.trim(),
      cargo: overlay.querySelector("#nu-cargo").value.trim(),
      instituto: overlay.querySelector("#nu-instituto").value,
      telefone: overlay.querySelector("#nu-telefone").value.trim(),
      ramal: overlay.querySelector("#nu-ramal").value.trim(),
    });

    if (mostrarSucessoOuErro(r)) {
      mostrarMensagem("success", "Usuário cadastrado com sucesso.");
      overlay.remove();
      /* recarrega a lista se a página estiver aberta */
      const rl = qs("#usu-conteudo");
      if (rl) ROTAS["#/usuarios"]();
    } else {
      btn.disabled = false; btn.innerHTML = rot;
    }
  });
}
