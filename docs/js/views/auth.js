/* views/auth.js — telas públicas: Entrar (#/login) e Cadastre-se (#/cadastro).
 * Reproduz base_auth.html + login.html + cadastro.html usando as mesmas classes.
 */

(function () {
  function cascaAuth(html) {
    qs("#app").innerHTML = `
      <div class="auth-body">
        <main class="auth-main">
          <div id="mensagens-flutuantes" hidden></div>
          ${html}
        </main>
        <footer class="rodape-marca"><img src="img/senai-fiems-logo.png" alt="SENAI | Sistema FIEMS"></footer>
      </div>`;
  }

  /* ------------------------------ ENTRAR ------------------------------ */
  ROTAS["#/login"] = function () {
    cascaAuth(`
      <div class="login-card">
        <h2>Entrar</h2>
        <p class="meta">Acesse com seu e-mail institucional.</p>
        <form id="form-login" class="formulario">
          <p>
            <label for="l-email">Usuário ou e-mail</label>
            <input id="l-email" name="username" type="email" autofocus placeholder="nome@ms.senai.br" class="campo">
          </p>
          <p>
            <label for="l-senha">Senha</label>
            <input id="l-senha" name="password" type="password" class="campo">
          </p>
          <button type="submit" class="botao"><i class="bi bi-box-arrow-in-right"></i> Entrar</button>
        </form>
        <p class="login-rodape">
          Não tem conta?
          <a href="#/cadastro"><i class="bi bi-person-plus"></i> Cadastre-se</a>
        </p>
      </div>`);

    qs("#form-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = val("l-email");
      const senha = val("l-senha");
      if (!email || !senha) { mostrarMensagem("error", "Informe e-mail e senha."); return; }

      const btn = qs("#form-login button[type=submit]");
      const rotulo = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Entrando…';

      const r = await API.chamar("login", { email, senha }, "");

      if (r.ok && r.data && r.data.token) {
        Sessao.gravar(r.data);
        montarLayout();
        atualizarNav("#/home");
        location.hash = "#/home"; /* hashchange dispara o render */
      } else {
        btn.disabled = false;
        btn.innerHTML = rotulo;
        mostrarMensagem("error", (r.erro) || "Credenciais inválidas.");
      }
    });
  };

  /* ------------------------------ CADASTRO ------------------------------ */
  function opcoes() {
    return CONFIG.INSTITUTOS.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  }

  ROTAS["#/cadastro"] = function () {
    cascaAuth(`
      <div class="cadastro-card">
        <h2>Cadastro de Usuário</h2>
        <p class="meta">Preencha seus dados. Aceitamos apenas e-mail institucional
            <strong>@ms.senai.br</strong>.</p>
        <form id="form-cadastro" class="formulario">
          <p>
            <label for="c-nome">Nome completo</label>
            <input id="c-nome" class="campo" required>
          </p>
          <p>
            <label for="c-email">E-mail institucional</label>
            <input id="c-email" class="campo" placeholder="nome@ms.senai.br" required>
          </p>
          <div class="campo-duplo">
            <p>
              <label for="c-area">Área de atuação</label>
              <input id="c-area" class="campo" required>
            </p>
            <p>
              <label for="c-cargo">Cargo</label>
              <input id="c-cargo" class="campo" required>
            </p>
          </div>
          <p>
            <label for="c-instituto">Instituto</label>
            <select id="c-instituto" class="campo">${opcoes()}</select>
          </p>
          <div class="campo-duplo">
            <p>
              <label for="c-telefone">Contato (telefone)</label>
              <input id="c-telefone" class="campo">
            </p>
            <p>
              <label for="c-ramal">Ramal</label>
              <input id="c-ramal" class="campo">
            </p>
          </div>
          <div class="campo-duplo">
            <p>
              <label for="c-senha1">Senha</label>
              <input id="c-senha1" type="password" class="campo" required>
            </p>
            <p>
              <label for="c-senha2">Confirmar senha</label>
              <input id="c-senha2" type="password" class="campo" required>
            </p>
          </div>
          <div class="modal-acoes">
            <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Cadastrar</button>
            <a class="link-secundario" href="#/login">Já tenho conta</a>
          </div>
        </form>
      </div>`);

    qs("#form-cadastro").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = val("c-email");
      if (!eMailInstitucionalOk(email)) {
        mostrarMensagem("error", "Só é aceito e-mail institucional @ms.senai.br.");
        return;
      }
      if (val("c-senha1") !== val("c-senha2")) {
        mostrarMensagem("error", "As senhas não coincidem.");
        return;
      }

      const btn = qs("#form-cadastro button[type=submit]");
      const rotulo = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cadastrando…';

      const r = await API.chamar("cadastrarUsuario", {
        nome_completo: val("c-nome"),
        email,
        area_atuacao: val("c-area"),
        cargo: val("c-cargo"),
        instituto: val("c-instituto"),
        telefone: val("c-telefone"),
        ramal: val("c-ramal"),
        senha: val("c-senha1"),
      }, "");
      if (mostrarSucessoOuErro(r)) {
        mostrarMensagem("success", "Conta criada! Usuário ativo — faça login.");
        setTimeout(() => (location.hash = "#/login"), 1200);
      } else {
        btn.disabled = false;
        btn.innerHTML = rotulo;
      }
    });
  };
})();
