/**
 * Setup.gs — inicialização idempotente da planilha e pasta de Drive.
 * Rode UMA única vez: inicializar() (menu do editor do Apps Script, ▶ Run).
 */

const ABAS = {
  Usuarios: ["nome_completo", "email", "grupo", "senha_hash", "salt", "area_atuacao",
             "cargo", "instituto", "telefone", "ramal", "ativo"],
  Pedidos: ["numero", "produto", "descricao_objeto", "quantidade", "modalidade",
            "urgencia", "possui_cotacao", "solicitante_nome", "criado_por",
            "data_envio", "status", "responsavel", "retorno_final",
            "criado_em", "atualizado_em", "assumido_em", "concluido_em", "instituto"],
  HistoricoStatus: ["numero_req", "de", "para", "usuario", "observacao", "criado_em"],
  AnexosAudit: ["id", "numero_req", "tipo", "nome_original", "drive_file_id",
                "enviado_por", "enviado_em"],
  Sessoes: ["token", "email", "expira_em"],
  ResetSenha: ["token", "email", "expira_em", "usado", "criado_em"],
  Notificacoes: ["id", "usuario_email", "tipo", "mensagem", "numero_req", "lida", "criado_em"],
};

function inicializar() {
  Object.keys(ABAS).forEach((nome) => {
    let sh = ss().getSheetByName(nome);
    if (!sh) sh = ss().insertSheet(nome);
    const cab = sh.getRange(1, 1, 1, ABAS[nome].length).getValues()[0];
    const faltam = ABAS[nome].filter((h, i) => String(cab[i] || "").trim() !== h);
    if (faltam.length === ABAS[nome].length) {
      sh.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]);
      sh.setFrozenRows(1);
    }
  });

  /* registra a conta ADMIN (protege contra exclusão/desativação) */
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_EMAIL")) {
    props.setProperty("ADMIN_EMAIL", ADMIN_EMAIL_PADRAO);
  }

  pastaRaizAnexos(); // cria e registra a pasta de Drive
  Logger.log("Inicialização concluída. Abas + pasta 'Compras Anexos' prontas. ADMIN: " + emailAdmin());
}

/** Cria o usuário ADMIN inicial (trocar a senha depois do 1º login). */
function criarGestorInicial() {
  const email = ADMIN_EMAIL_PADRAO;
  const senha = ADMIN_SENHA_PADRAO;
  exigir(!buscarUsuario(email), "Usuário já existe.");
  const salt = Utilities.getUuid();
  inserirLinha("Usuarios", [
    "Administrador do Sistema", email, GRUPOS.MANAGER, hashSenha(senha, salt), salt,
    "Gestão", "Administrador", CONFIG_INSTITUTOS[0], "", "", true,
  ]);
  Logger.log("Administrador criado: " + email);
}

/**
 * Migração: transforma a conta administrativa antiga em admin@ms.senai.br,
 * define a senha padrão e atualiza TODAS as referências por e-mail nas abas
 * (pedidos, histórico e auditoria de anexos). Rode UMA vez.
 */
function migrarAdministrador() {
  const emailNovo = ADMIN_EMAIL_PADRAO;
  const emailAntigo = "gestor@ms.senai.br";

  const antigo = buscarUsuarioPorLinha(emailAntigo);
  const novo = buscarUsuarioPorLinha(emailNovo);
  exigir(antigo || novo, "Não encontrei a conta administrativa (" + emailAntigo + " nem " + emailNovo + ").");

  let alvo = antigo || novo;
  if (antigo && novo && antigo.__linha__ !== novo.__linha__) {
    /* já existia admin@: remove a duplicata antiga e ajusta na conta nova */
    removerLinha("Usuarios", antigo.__linha__);
    alvo = novo;
  }

  /* Recalcula a linha do alvo (uma remoção acima pode deslocar as referências) */
  const linha = (novo ? buscarUsuarioPorLinha(emailNovo) : alvo).__linha__;
  const salt = Utilities.getUuid();
  const sh = aba("Usuarios");

  sh.getRange(linha, 2).setValue(emailNovo);                        /* email */
  sh.getRange(linha, 3).setValue(GRUPOS.MANAGER);                  /* grupo */
  sh.getRange(linha, 4).setValue(hashSenha(ADMIN_SENHA_PADRAO, salt)); /* senha_hash */
  sh.getRange(linha, 5).setValue(salt);                            /* salt */
  sh.getRange(linha, 11).setValue(true);                           /* ativo */

  /* atualiza referências por e-mail em outras abas */
  reapontarEmail(emailAntigo, emailNovo);

  PropertiesService.getScriptProperties().setProperty("ADMIN_EMAIL", emailNovo);
  Logger.log("Admin migrado para " + emailNovo + " (senha: " + ADMIN_SENHA_PADRAO + ").");
}

/**
 * Remove contas legadas que não devem mais existir (ex.: gestor@ e userteste@).
 * Seguro: reaponta referências do antigo admin para o novo e NÃO remove
 * usuário com requisições vinculadas. Rode UMA vez.
 */
function removerUsuariosLegados() {
  const admin = ADMIN_EMAIL_PADRAO;
  const antigoAdmin = "gestor@ms.senai.br";

  /* qualquer referência remanescente do admin antigo vai para o novo */
  reapontarEmail(antigoAdmin, admin);

  ["gestor@ms.senai.br", "userteste@ms.senai.br"].forEach((email) => {
    const alvo = buscarUsuarioPorLinha(email);
    if (!alvo) { Logger.log("(não existe, nada a fazer): " + email); return; }

    const vinculado = lerAba("Pedidos").some((p) =>
      String(p.criado_por).toLowerCase() === email ||
      String(p.responsavel).toLowerCase() === email);

    if (vinculado) {
      Logger.log("NÃO removido (possui requisições vinculadas): " + email);
      return;
    }
    removerLinha("Usuarios", alvo.__linha__);
    Logger.log("Removido: " + email);
  });
}

/* ------------------------------------------------------------------ */
/* Migração de status para a nova regra (Em Análise -> Aberto)          */
/* ------------------------------------------------------------------ */
function migrarStatusRequisicoes() {
  const sh = aba("Pedidos");
  const vals = sh.getDataRange().getValues();
  let alterados = 0;
  for (let i = 1; i < vals.length; i++) {
    const linha = i + 1;
    const status = String(vals[i][P_COL.status - 1]);
    const responsavel = String(vals[i][P_COL.responsavel - 1] || "").trim();

    if (status === "concluida" || status === "cancelada" || status === "aberto") continue;

    let novo = status;
    if (status === "aberta" || status === "enviada") novo = "em_analise";
    else if (status === "em_analise" && responsavel) novo = "aberto";

    if (novo !== status) {
      sh.getRange(linha, P_COL.status).setValue(novo);
      alterados++;
    }

    /* garante data_envio preenchida para o lead time */
    if (!vals[i][P_COL.data_envio - 1]) {
      sh.getRange(linha, P_COL.data_envio).setValue(vals[i][P_COL.criado_em - 1] || new Date());
    }
  }
  Logger.log("Status migrados: " + alterados);
}

/* Garante a coluna 'instituto' nas requisoes existentes. */
function migrarInstitutoPedidos() {
  const cab = ["numero", "produto", "descricao_objeto", "quantidade", "modalidade",
    "urgencia", "possui_cotacao", "solicitante_nome", "criado_por",
    "data_envio", "status", "responsavel", "retorno_final",
    "criado_em", "atualizado_em", "assumido_em", "concluido_em", "instituto"];
  const sh = aba("Pedidos");
  const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), cab.length)).getValues()[0];
  for (let i = 0; i < cab.length; i++) {
    if (String(headers[i] || "").trim() !== cab[i]) {
      sh.getRange(1, i + 1).setValue(cab[i]);
    }
  }
  const vals = sh.getDataRange().getValues();
  let alterados = 0;
  for (let i = 1; i < vals.length; i++) {
    const linha = i + 1;
    if (String(vals[i][17] || "").trim() === "") {
      sh.getRange(linha, 18).setValue("SENAI MS - Departamento Regional");
      alterados++;
    }
  }
  Logger.log("Institutos preenchidos: " + alterados);
}

/* ------------------------------------------------------------------ */
/* Remoção completa de usuário + requisições (uso administrativo)       */
/* ------------------------------------------------------------------ */
function removerUsuarioCompleto(emailAlvo) {
  const email = String(emailAlvo || "").trim().toLowerCase();
  exigir(email, "Informe o e-mail do usuário a ser removido.");

  /* 1) Remove sessões ativas do usuário. */
  lerAbaComLinha("Sessoes")
    .filter((s) => String(s.email).toLowerCase() === email)
    .reverse()
    .forEach((s) => removerLinha("Sessoes", s.__linha__));

  /* 2) Limpa o usuário como responsável em requisições de terceiros. */
  const shPedidos = aba("Pedidos");
  const vals = shPedidos.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][P_COL.responsavel - 1]).toLowerCase() === email) {
      shPedidos.getRange(i + 1, P_COL.responsavel).setValue("");
    }
  }

  /* 3) Exclui requisições criadas pelo usuário (anexos + histórico + pedido). */
  const pedidos = lerAbaComLinha("Pedidos")
    .filter((p) => String(p.criado_por).toLowerCase() === email)
    .sort((a, b) => b.__linha__ - a.__linha__);

  pedidos.forEach((pr) => {
    const numero = String(pr.numero);

    lerAbaComLinha("AnexosAudit")
      .filter((a) => String(a.numero_req) === numero)
      .sort((a, b) => b.__linha__ - a.__linha__)
      .forEach((a) => {
        try { DriveApp.getFileById(a.drive_file_id).setTrashed(true); } catch (e) { /* gone */ }
        removerLinha("AnexosAudit", a.__linha__);
      });

    lerAbaComLinha("HistoricoStatus")
      .filter((h) => String(h.numero_req) === numero)
      .sort((a, b) => b.__linha__ - a.__linha__)
      .forEach((h) => removerLinha("HistoricoStatus", h.__linha__));

    removerLinha("Pedidos", pr.__linha__);
  });

  /* 4) Remove a conta do usuário. */
  const alvo = buscarUsuarioPorLinha(email);
  if (alvo) removerLinha("Usuarios", alvo.__linha__);

  Logger.log("Usuário removido completamente: " + email +
    " (requisições excluídas: " + pedidos.length + ")");
}

/* ------------------------------------------------------------------ */
/* Reset de senha por e-mail                                          */
/* ------------------------------------------------------------------ */

const ABA_RESET = "ResetSenha";
const CAB_RESET = ["token", "email", "expira_em", "usado", "criado_em"];
const RESET_VALIDADE_MIN = 30; /* minutos */

/** Passo 1: o usuário informa o e-mail e recebe o link de redefinição. */
function apiSolicitarResetSenha(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  exigirEmailInstitucional(email);

  /* Resposta sempre igual (não revela se o e-mail existe) */
  const respostaPadrao = {
    ok: true,
    data: { mensagem: "Se existir uma conta com este e-mail, enviaremos as instruções de redefinição." },
  };

  const u = buscarUsuario(email);
  if (!u || !isValido(u)) return respostaPadrao;

  const sh = abaOuCriar(ABA_RESET, CAB_RESET);

  /* invalida tokens anteriores deste e-mail */
  const linhas = sh.getDataRange().getValues();
  for (let i = linhas.length - 1; i >= 1; i--) {
    if (String(linhas[i][1]).toLowerCase() === email) sh.deleteRow(i + 1);
  }

  const token = Utilities.getUuid().replace(/-/g, "");
  const expira = new Date(Date.now() + RESET_VALIDADE_MIN * 60 * 1000);
  sh.appendRow([token, email, expira, false, new Date()]);

  /* base_url vem do próprio site (informa onde o SPA está publicado) */
  const base = String(payload.base_url || "").replace(/#.*$/, "");
  const link = base ? base + "#/redefinir/" + token : token;

  const nome = u.nome_completo || email;
  const assunto = "Projeto Compras — redefinição de senha";
  const corpo =
    "Olá, " + nome + "!\n\n" +
    "Recebemos um pedido de redefinição de senha da sua conta no Projeto Compras.\n\n" +
    (base
      ? "Abra o link abaixo para definir uma nova senha:\n" + link + "\n\n"
      : "Use este código para redefinir sua senha: " + token + "\n\n") +
    "O link/código é válido por " + RESET_VALIDADE_MIN + " minutos.\n" +
    "Se você não solicitou, ignore este e-mail.\n\n" +
    "Sistema FIEMS — Projeto Compras";

  try {
    MailApp.sendEmail({ to: email, subject: assunto, body: corpo });
  } catch (e) {
    Logger.log("Falha ao enviar e-mail de reset: " + (e && e.message));
  }

  return respostaPadrao;
}

/** Passo 2: o usuário define a nova senha com o token recebido. */
function apiRedefinirSenha(payload) {
  const token = String(payload.token || "").trim();
  const senha = String(payload.senha || "");
  const senha2 = String(payload.senha2 || "");

  exigir(token, "Token ausente. Solicite uma nova redefinição.");
  exigir(senha.length >= 6, "A senha deve ter ao menos 6 caracteres.");
  exigir(!senha2 || senha === senha2, "As senhas não coincidem.");

  const sh = abaOuCriar(ABA_RESET, CAB_RESET);
  const linhas = sh.getDataRange().getValues();
  for (let i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== token) continue;

    const expira = new Date(linhas[i][2]);
    const usado = String(linhas[i][3]).toUpperCase() === "TRUE";
    exigir(!usado, "Este link de redefinição já foi utilizado.");
    exigir(expira.getTime() > Date.now(), "Este link de redefinição expirou. Solicite outro.");

    const email = String(linhas[i][1]).toLowerCase();
    const alvo = buscarUsuarioPorLinha(email);
    exigir(alvo, "Usuário não encontrado.");

    const salt = Utilities.getUuid();
    aba("Usuarios").getRange(alvo.__linha__, 4).setValue(hashSenha(senha, salt)); /* senha_hash */
    aba("Usuarios").getRange(alvo.__linha__, 5).setValue(salt);                    /* salt */
    sh.getRange(i + 1, 4).setValue(true);                                          /* usado */

    return { ok: true, data: { email, mensagem: "Senha redefinida com sucesso. Faça login." } };
  }

  throw new Error("Link de redefinição inválido. Solicite uma nova redefinição.");
}
