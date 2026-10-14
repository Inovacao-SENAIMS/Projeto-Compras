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
  if (usuario.grupo === GRUPOS.MANAGER) {
    /* Gestão vê o Time + Solicitantes (para designar), mas só gerencia o Time */
    usuarios = usuarios.filter(
      (u) => u.grupo === GRUPOS.TIME || u.grupo === GRUPOS.MANAGER || u.grupo === GRUPOS.SOLICITANTE
    );
  }

  return {
    ok: true,
    data: usuarios.map(levantarUsuarioPublico),
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

  const alvo = buscarUsuarioPorLinha(email);
  exigir(alvo, "Usuário não encontrado.");

  if (usuario.grupo === GRUPOS.MANAGER && !isSuper(usuario)) {
    exigir(alvo.grupo === GRUPOS.TIME,
      "A Gestão gerencia apenas membros do Time de Compras.");
  }

  aba("Usuarios").getRange(alvo.__linha__, COLUNA_USUARIO_ATIVO).setValue(ativo);
  return { ok: true, data: { email, ativo } };
}

function apiExcluirUsuario(payload, usuario) {
  const email = String(payload.email || "").trim().toLowerCase();
  exigir(isManager(usuario) || isSuper(usuario), "Sem permissão para excluir usuários.");
  exigir(email !== String(usuario.email).toLowerCase(), "Ninguém exclui a si mesmo.");

  const alvo = buscarUsuarioPorLinha(email);
  exigir(alvo, "Usuário não encontrado.");

  if (usuario.grupo === GRUPOS.MANAGER && !isSuper(usuario)) {
    exigir(alvo.grupo === GRUPOS.TIME, "A Gestão exclui apenas membros do Time de Compras.");
  }

  const temPedidos = lerAba("Pedidos").some(
    (p) => String(p.criado_por).toLowerCase() === email || String(p.responsavel).toLowerCase() === email
  );
  exigir(!temPedidos,
    "Exclusão bloqueada: este usuário possui requisições vinculadas (criadas ou assumidas).");

  removerLinha("Usuarios", alvo.__linha__);
  return { ok: true, data: { email } };
}

/* índices: 1 = nome_completo ... 11 = ativo (excel 1-based) */
const COLUNA_USUARIO_ATIVO = 11;

function apiListaResponsaveis(payload, usuario) {
  /* Para o designar popup: apenas membros do Time (+ Gestão). */
  const ls = lerAba("Usuarios").filter((u) => isValido(u) && isEquipe(u));
  return {
    ok: true,
    data: ls.map((u) => ({ email: String(u.email).toLowerCase(), nome: u.nome_completo })),
  };
}
