/**
 * Auth.gs — login/cadastro/logout + sessões.
 * Senha: SHA-256(salt + senha) em base64, salt aleatório por usuário.
 */

function apiLogin(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const senha = String(payload.senha || "");
  exigir(email && senha, "Informe e-mail e senha.");

  const u = buscarUsuario(email);
  if (!u) return { ok: false, erro: "Credenciais inválidas." };
  if (!isValido(u)) return { ok: false, erro: "Usuário inativo. Fale com a Gestão." };

  if (hashSenha(senha, u.salt) !== String(u.senha_hash)) {
    return { ok: false, erro: "Credenciais inválidas." };
  }

  const token = criarSessao(u);
  return {
    ok: true,
    data: {
      token,
      email,
      nome: nomeExibicao(email, u.nome_completo),
      grupo: String(u.grupo),
      expira_em: Date.now() + 8 * 60 * 60 * 1000,
    },
  };
}

function apiLogout(payload, usuario) {
  encerrarSessao(payload._token); /* roteador injeta o token em payload._token */
  return { ok: true, data: null };
}

function apiCadastrarUsuario(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const nome = String(payload.nome_completo || "").trim();
  const senha = String(payload.senha || "");
  const senha2 = String(payload.senha2 || "");

  exigirEmailInstitucional(email);
  exigir(nome, "Informe o nome completo.");
  exigir(senha.length >= 6, "A senha deve ter ao menos 6 caracteres.");
  exigir(!senha2 || senha === senha2, "As senhas não coincidem.");
  exigir(!buscarUsuario(email), "Já existe uma conta para este e-mail.");
  /* Auto-registro entra sempre como solicitante (igual ao Django). */

  const salt = Utilities.getUuid();
  inserirLinha("Usuarios", [
    nome, email, GRUPOS.SOLICITANTE, hashSenha(senha, salt), salt,
    String(payload.area_atuacao || ""), String(payload.cargo || ""),
    String(payload.instituto || ""), String(payload.telefone || ""),
    String(payload.ramal || ""), true,
  ]);

  return { ok: true, data: { email } };
}
