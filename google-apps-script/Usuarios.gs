/**
 * Usuarios.gs — dados do usuário e gestão (ativar/inativar/excluir).
 * Regras (iguais ao Django/accounts):
 *  - Gestão (Manager_Compras) gerencia apenas membros do Time_Compras;
 *  - SuperUsuário gerencia todos;
 *  - ninguém gerencia a si mesmo;
 *  - exclusão bloqueada quando o usuário tem pedidos vinculados (PROTECT).
 */

function apiMeusDados(payload, usuario) {
  return {
    ok: true,
    data: {
      nome_completo: usuario.nome_completo,
      email: String(usuario.email).toLowerCase(),
      grupo: String(usuario.grupo),
      area_atuacao: usuario.area_atuacao,
      cargo: usuario.cargo,
      instituto: usuario.instituto,
      telefone: usuario.telefone,
      ramal: usuario.ramal,
      ativo: isValido(usuario),
    },
  };
}

function apiListarUsuarios(payload, usuario) {
  exigir(isManager(usuario) || usuario.grupo === GRUPOS.SUPER,
    "Apenas a Gestão pode listar usuários.");

  let usuarios = lerAba("Usuarios");
  /* Gestão não enxerga contas de SuperUsuário (não as administra) */
  usuarios = usuarios.filter((u) => String(u.grupo) !== GRUPOS.SUPER);

  const eu = String(usuario.email).toLowerCase();
  return {
    ok: true,
    data: usuarios.map((u) => {
      const pub = levantarUsuarioPublico(u);
      pub.sou_eu = pub.email === eu;
      pub.is_admin = ehAdmin(pub.email);
      return pub;
    }),
  };
}

function levantarUsuarioPublico(u) {
  return {
    nome_completo: u.nome_completo,
    email: String(u.email).toLowerCase(),
    grupo: String(u.grupo),
    area_atuacao: u.area_atuacao,
    cargo: u.cargo,
    instituto: u.instituto,
    telefone: u.telefone,
    ramal: u.ramal,
    ativo: isValido(u),
  };
}

function apiAlterarStatusUsuario(payload, usuario) {
  const email = String(payload.email || "").trim().toLowerCase();
  const ativo = !!payload.ativo;
  exigir((isManager(usuario) || isSuper(usuario)), "Sem permissão para gerenciar usuários.");
  exigir(email !== String(usuario.email).toLowerCase(), "Ninguém gerencia a si mesmo.");
  exigirNaoAdmin(email, "inativada");

  const alvo = buscarUsuarioPorLinha(email);
  exigir(alvo, "Usuário não encontrado.");
  exigir(String(alvo.grupo) !== GRUPOS.SUPER || isSuper(usuario),
    "Não é possível gerenciar uma conta de SuperUsuário.");

  aba("Usuarios").getRange(alvo.__linha__, COLUNA_USUARIO_ATIVO).setValue(ativo);
  return { ok: true, data: { email, ativo } };
}

function apiExcluirUsuario(payload, usuario) {
  const email = String(payload.email || "").trim().toLowerCase();
  exigir(isManager(usuario) || isSuper(usuario), "Sem permissão para excluir usuários.");
  exigir(email !== String(usuario.email).toLowerCase(), "Ninguém exclui a si mesmo.");
  exigirNaoAdmin(email, "excluída");

  const alvo = buscarUsuarioPorLinha(email);
  exigir(alvo, "Usuário não encontrado.");
  exigir(String(alvo.grupo) !== GRUPOS.SUPER || isSuper(usuario),
    "Não é possível excluir uma conta de SuperUsuário.");

  const temPedidos = lerAba("Pedidos").some(
    (p) => String(p.criado_por).toLowerCase() === email || String(p.responsavel).toLowerCase() === email
  );
  exigir(!temPedidos,
    "Exclusão bloqueada: este usuário possui requisições vinculadas (criadas ou assumidas).");

  removerLinha("Usuarios", alvo.__linha__);
  return { ok: true, data: { email } };
}

/* ------------------------------------------------------------------ */
/* Administração de usuários (página exclusiva da Gestão)             */
/* ------------------------------------------------------------------ */

const COLUNA_USUARIO_GRUPO = 3;

/** Cria um usuário com perfil escolhido pela Gestão (já ativo). */
function apiCriarUsuarioAdmin(payload, usuario) {
  exigir(isManager(usuario) || isSuper(usuario), "Apenas a Gestão pode cadastrar usuários.");

  const email = String(payload.email || "").trim().toLowerCase();
  const nome = String(payload.nome_completo || "").trim();
  const senha = String(payload.senha || "");
  const grupo = String(payload.grupo || GRUPOS.SOLICITANTE);

  exigirEmailInstitucional(email);
  exigir(nome, "Informe o nome completo.");
  exigir(senha.length >= 6, "A senha deve ter ao menos 6 caracteres.");
  exigir(!buscarUsuario(email), "Já existe uma conta para este e-mail.");
  exigir([GRUPOS.SOLICITANTE, GRUPOS.TIME, GRUPOS.MANAGER].indexOf(grupo) >= 0,
    "Perfil inválido. Use UserISI_IST, Time_Compras ou Manager_Compras.");

  const salt = Utilities.getUuid();
  inserirLinha("Usuarios", [
    nome, email, grupo, hashSenha(senha, salt), salt,
    String(payload.area_atuacao || ""), String(payload.cargo || ""),
    String(payload.instituto || ""), String(payload.telefone || ""),
    String(payload.ramal || ""), true,
  ]);

  return { ok: true, data: { email, grupo } };
}

/** Altera o perfil (grupo) de um usuário — nunca de si mesmo nem de SuperUsuário. */
function apiAlterarGrupoUsuario(payload, usuario) {
  exigir(isManager(usuario) || isSuper(usuario), "Sem permissão para alterar perfis.");

  const email = String(payload.email || "").trim().toLowerCase();
  const grupo = String(payload.grupo || "");

  exigir(email !== String(usuario.email).toLowerCase(), "Você não pode alterar o próprio perfil.");
  exigirNaoAdmin(email, "alterada");
  exigir([GRUPOS.SOLICITANTE, GRUPOS.TIME, GRUPOS.MANAGER].indexOf(grupo) >= 0,
    "Perfil inválido. Use UserISI_IST, Time_Compras ou Manager_Compras.");

  const alvo = buscarUsuarioPorLinha(email);
  exigir(alvo, "Usuário não encontrado.");
  exigir(String(alvo.grupo) !== GRUPOS.SUPER || isSuper(usuario),
    "Não é possível alterar o perfil de um SuperUsuário.");

  aba("Usuarios").getRange(alvo.__linha__, COLUNA_USUARIO_GRUPO).setValue(grupo);
  return { ok: true, data: { email, grupo } };
}

/* índices: 1 = nome_completo ... 11 = ativo (excel 1-based) */
const COLUNA_USUARIO_ATIVO = 11;

function apiListaResponsaveis(payload, usuario) {
  /* Para o designar popup: membros do Time (+ Gestão). SuperUsuário é invisível. */
  const ls = lerAba("Usuarios").filter((u) => isValido(u) && isEquipe(u) && !isSuper(u));
  return {
    ok: true,
    data: ls.map((u) => ({ email: String(u.email).toLowerCase(), nome: u.nome_completo })),
  };
}
