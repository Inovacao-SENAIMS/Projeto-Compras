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
            "criado_em", "atualizado_em", "assumido_em", "concluido_em"],
  HistoricoStatus: ["numero_req", "de", "para", "usuario", "observacao", "criado_em"],
  AnexosAudit: ["id", "numero_req", "tipo", "nome_original", "drive_file_id",
                "enviado_por", "enviado_em"],
  Sessoes: ["token", "email", "expira_em"],
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

  pastaRaizAnexos(); // cria e registra a pasta de Drive
  Logger.log("Inicialização concluída. Abas + pasta 'Compras Anexos' prontas.");
}

/** Cria o usuário Gestor inicial (trocar a senha depois do 1º login). */
function criarGestorInicial() {
  const email = "gestor@ms.senai.br";
  const senha = "Gestor@2026"; // trocar!
  exigir(!buscarUsuario(email), "Usuário já existe.");
  const salt = Utilities.getUuid();
  inserirLinha("Usuarios", [
    "Gestor de Compras", email, GRUPOS.MANAGER, hashSenha(senha, salt), salt,
    "Gestão", "Gestor de Compras", CONFIG_INSTITUTOS[0], "", "", true,
  ]);
  Logger.log("Gestor criado: " + email);
}
