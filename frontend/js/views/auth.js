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
        <button type="button" id="btn-sso-ms" class="botao botao-secundario" hidden>
          <i class="bi bi-microsoft"></i> Entrar com Microsoft
        </button>
        <div id="sso-ou" class="login-divisao" hidden><span>ou</span></div>
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
        <p class="login-rodape">
          <a href="#" id="lnk-esqueci"><i class="bi bi-key"></i> Esqueci minha senha</a>
        </p>
      </div>`);

    qs("#lnk-esqueci").addEventListener("click", (ev) => { ev.preventDefault(); modalEsqueciSenha(); });

    /* SSO (Microsoft Entra): mostra o botão se o servidor tiver OIDC ativado */
    API.chamar("config").then((r) => {
      if (r.ok && r.data && r.data.sso) {
        const btn = qs("#btn-sso-ms");
        const ou = qs("#sso-ou");
        if (btn) btn.hidden = false;
        if (ou) ou.hidden = false;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const u = await API.chamar("ssoUrl", {}, "");
          if (u.ok && u.data && u.data.url) location.href = u.data.url;
          else { btn.disabled = false; mostrarMensagem("error", u.erro || "SSO indisponível."); }
        });
      }
    });

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
        if (r.data.troca_senha_obrigatoria) {
          mostrarMensagem("warning", "Sua senha é provisória. Altere-a em Configurações > Segurança.");
        }
        location.hash = "#/home"; /* hashchange dispara o render */
      } else {
        btn.disabled = false;
        btn.innerHTML = rotulo;
        mostrarMensagem("error", (r.erro) || "Credenciais inválidas.");
      }
    });
  };

  /* ------------------------------ SSO callback ------------------------------
   * O backend Entra ID redireciona para #/sso/{token}; gravamos a sessão
   * buscando os dados do usuário e entramos no app. #/sso/erro = falha. */
  ROTAS["#/sso/<token>"] = async function (token) {
    if (token === "erro") {
      cascaAuth(`
        <div class="login-card">
          <h2>Entrar</h2>
          <ul class="mensagens"><li class="msg msg-error">
            <i class="bi bi-x-circle-fill"></i>
            <span>Não foi possível concluir o login corporativo. Tente novamente.</span>
          </li></ul>
          <p class="login-rodape"><a href="#/login"><i class="bi bi-arrow-left"></i> Voltar ao login</a></p>
        </div>`);
      return;
    }

    const base = CONFIG.API_URL ? CONFIG.API_URL.replace(/\/+$/, "") : "/api";
    try {
      const r = await fetch(base + "/me", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error("Sessão do login corporativo inválida.");
      const eu = await r.json();
      Sessao.gravar({ token, email: eu.email, nome: eu.nome_completo, grupo: eu.grupo });
      montarLayout();
      atualizarNav("#/home");
      location.hash = "#/home"; /* hashchange dispara o render */
    } catch (e) {
      location.hash = "#/login";
      setTimeout(() => mostrarMensagem("error", e.message || "Falha no login corporativo."), 50);
    }
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

  /* ---------------------- ESQUECI A SENHA (popup) ---------------------- */
  function modalEsqueciSenha() {
    const overlay = abrirModalHTML(`
      <div class="modal-cabecalho">
        <h2><i class="bi bi-key"></i> Redefinir senha</h2>
        <button type="button" class="modal-fechar" data-fechar>&times;</button>
      </div>
      <div class="modal-corpo">
        <p class="meta">Informe seu e-mail institucional. Enviaremos um link para você criar uma nova senha.</p>
        <form id="form-esqueci" class="formulario">
          <p>
            <label for="e-email">E-mail institucional</label>
            <input id="e-email" class="campo" placeholder="nome@ms.senai.br" required>
          </p>
          <div class="modal-acoes">
            <button type="submit" class="botao"><i class="bi bi-envelope"></i> Enviar link</button>
            <button type="button" class="botao botao-cancelar" data-fechar>Cancelar</button>
          </div>
        </form>
      </div>`);

    overlay.querySelector("#form-esqueci").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = overlay.querySelector("#e-email").value.trim();
      if (!eMailInstitucionalOk(email)) {
        mostrarMensagem("error", "Só é aceito e-mail institucional @ms.senai.br.");
        return;
      }
      const btn = overlay.querySelector('button[type="submit"]');
      btn.disabled = true;
      const rot = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Enviando…';

      const r = await API.chamar("solicitarResetSenha", {
        email,
        base_url: location.origin + location.pathname,
      }, "");

      if (r.ok) {
        overlay.remove();
        mostrarMensagem("success", (r.data && r.data.mensagem) ||
          "Se existir uma conta com este e-mail, enviaremos as instruções de redefinição.");
      } else {
        btn.disabled = false;
        btn.innerHTML = rot;
        mostrarMensagem("error", r.erro || "Não foi possível solicitar a redefinição.");
      }
    });
  }

  /* ---------------------- REDEFINIR SENHA (link do e-mail) ---------------------- */
  ROTAS["#/redefinir/<token>"] = function (token) {
    cascaAuth(`
      <div class="login-card">
        <h2>Nova senha</h2>
        <p class="meta">Defina uma nova senha para a sua conta.</p>
        <form id="form-redefinir" class="formulario">
          <p>
            <label for="r-senha1">Nova senha</label>
            <input id="r-senha1" type="password" class="campo" required>
          </p>
          <p>
            <label for="r-senha2">Confirmar nova senha</label>
            <input id="r-senha2" type="password" class="campo" required>
          </p>
          <div class="modal-acoes">
            <button type="submit" class="botao"><i class="bi bi-check-lg"></i> Redefinir senha</button>
            <a class="link-secundario" href="#/login">Voltar ao login</a>
          </div>
        </form>
      </div>`);

    qs("#form-redefinir").addEventListener("submit", async (e) => {
      e.preventDefault();
      const s1 = val("r-senha1");
      const s2 = val("r-senha2");
      if (!token) { mostrarMensagem("error", "Link inválido. Solicite uma nova redefinição."); return; }
      if (s1.length < 6) { mostrarMensagem("error", "A senha deve ter ao menos 6 caracteres."); return; }
      if (s1 !== s2) { mostrarMensagem("error", "As senhas não coincidem."); return; }

      const btn = qs("#form-redefinir button[type=submit]");
      btn.disabled = true;
      const rot = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Salvando…';

      const r = await API.chamar("redefinirSenha", { token, senha: s1, senha2: s2 }, "");
      if (r.ok) {
        mostrarMensagem("success", "Senha redefinida com sucesso! Faça login.");
        setTimeout(() => (location.hash = "#/login"), 1400);
      } else {
        btn.disabled = false;
        btn.innerHTML = rot;
        mostrarMensagem("error", r.erro || "Não foi possível redefinir a senha.");
      }
    });
  };
})();
