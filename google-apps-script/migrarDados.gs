/**
 * migrarDados.gs — migração one-time (Fase 4) do Django para o Google.
 *
 * Passos:
 *  1) rode exportar_migracao.py no projeto Django → pasta "migracao/" com
 *     Usuarios.csv, Pedidos.csv, HistoricoStatus.csv, AnexosAudit.csv.
 *  2) Suba os 4 CSVs para qualquer pasta e rode no Apps Script:
 *       importarUsuariosePedidos()   (escolha os CSVs com as caixas de diálogo)
 *  3) envieAnexosLocaisParaDrive() exige os arquivos no seu Drive (upload
 *     manual da pasta "media/anexos" ou qualquer pasta com os arquivos);
 *     informe a pasta na constante PASTA_CSV_ABAIXO ANTES de rodar.
 *
 * Cada função é idempotente-QUALIFICADA: só rode UMA vez (depois use abrir/resetar).
 */

const PASTA_CSV = ""; // ID da pasta do Drive com os CSVs (deixe "" p/ escolher via diálogo)
const PASTA_ANEXOS = ""; // ID da pasta com os arquivos de anexos (upload manual)

/* ------------------------------------------------------------- utilidades */

function escolherCsv(nome) {
  if (PASTA_CSV) {
    const it = DriveApp.getFolderById(PASTA_CSV).getFilesByName(nome);
    exigir(it.hasNext(), "CSV não encontrado na pasta configurada: " + nome);
    return it.next();
  }
  const seletorOk = true; /* escolha é fixa: pasta configurada em PASTA_CSV */
  throw new Error("Configure a constante PASTA_CSV com o ID da pasta dos CSVs.");
}

function lerCsv(arquivo) {
  const linhas = Utilities.parseCsv(arquivo.getBlob().getDataAsString("UTF-8"), ";");
  const cab = linhas[0];
  return linhas.slice(1).map((l) => {
    const o = {};
    cab.forEach((h, i) => { o[h.trim()] = i < l.length ? l[i] : ""; });
    return o;
  });
}

function _dataOuVazio(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/* ------------------------------------------------------------- importar */

function importarUsuarios() {
  const dados = lerCsv(escolherCsv("Usuarios.csv"));
  const saltPadrao = "migracao-nao-ha-salt";

  let n = 0;
  dados.forEach((u) => {
    exigir(!buscarUsuario(u.email), "Usuário duplicado na planilha: " + u.email + " — importe apenas uma vez.");
    /* senha: marcador "!!!" (o usuário reseta via página "Esqueci a senha"/gestão) */
    const salt = Utilities.getUuid();
    inserirLinha("Usuarios", [
      u.nome_completo, String(u.email).toLowerCase(), u.grupo,
      hashSenha("troque-a-senha@2026", salt), salt,
      u.area_atuacao, u.cargo, u.instituto, u.telefone, u.ramal,
      String(u.ativo).toLowerCase() !== "false",
    ]);
    n++;
  });
  Logger.log("Usuários importados: " + n);
}

function importarPedidos() {
  const sh = aba("Pedidos");
  const dados = lerCsv(escolherCsv("Pedidos.csv"));

  dados.forEach((p) => {
    sh.appendRow([
      p.numero, p.produto, p.descricao_objeto, Number(p.quantidade || 1),
      p.modalidade, p.urgencia || "baixa",
      String(p.possui_cotacao).toLowerCase() === "true",
      p.solicitante_nome, String(p.criado_por).toLowerCase(),
      _dataOuVazio(p.data_envio), p.status,
      p.responsavel ? String(p.responsavel).toLowerCase() : "",
      p.retorno_final,
      _dataOuVazio(p.criado_em), _dataOuVazio(p.atualizado_em),
      _dataOuVazio(p.assumido_em), _dataOuVazio(p.concluido_em),
    ]);
  });
  Logger.log("Pedidos importados: " + dados.length);
}

function importarHistorico() {
  const dados = lerCsv(escolherCsv("HistoricoStatus.csv"));
  dados.forEach((h) => {
    inserirLinha("HistoricoStatus", [
      h.numero_req, h.de, h.para, String(h.usuario).toLowerCase(),
      h.observacao, _dataOuVazio(h.criado_em) || new Date(),
    ]);
  });
  Logger.log("Histórico importado: " + dados.length);
}

/** Importa o registro dos anexos (o arquivo em si é enviado por envieAnexosLocaisParaDrive). */
function importarAuditAnexos() {
  const dados = lerCsv(escolherCsv("AnexosAudit.csv"));
  dados.forEach((a) => {
    inserirLinha("AnexosAudit", [
      "mig-" + a.id_arquivo, a.numero_req, a.tipo || "documentacao",
      a.nome_original, a.caminho_local /* temporário: caminho local */,
      String(a.enviado_por).toLowerCase(), _dataOuVazio(a.enviado_em) || new Date(),
    ]);
  });
  Logger.log("Audit de anexos importado: " + dados.length);
}

/* ------------------------------------------------------------- anexos ao Drive */

/**
 * Envia os arquivos (upload prévio na pasta PASTA_ANEXOS, replicando a
 * estrutura media/anexos/<pedido>/...) para a pasta raiz "Compras Anexos"
 * e converte a coluna drive_file_id da auditoria.
 */
function enviarAnexosAoDrive() {
  exigir(PASTA_ANEXOS, "Configure PASTA_ANEXOS com o ID da pasta com os arquivos de anexos.");
  const origem = DriveApp.getFolderById(PASTA_ANEXOS);

  const linhas = lerAbaComLinha("AnexosAudit");
  const audit = aba("AnexosAudit");
  let enviados = 0;

  linhas.forEach((a) => {
    const caminho = String(a.drive_file_id || ""); /* temporariamente o caminho local */
    if (caminho.startsWith("ANX-") || !caminho) return; // já migrado/vazio

    /* caminho local informado em migrate: .../media/anexos/<pedido_pk>/uuid.ext */
    const pedacos = caminho.split(/[\\/]/);
    const pastaPedidoPk = pedacos.indexOf("anexos") >= 0 ? pedacos[pedacos.indexOf("anexos") + 1] : null;
    const nomeArquivo = pedacos[pedacos.length - 1];

    /* encontra o arquivo (por nome, varrendo subpastas) */
    let pastaBusca = origem;
    if (pastaPedidoPk) {
      const it = origem.getFoldersByName(String(a.numero_req));
      pastaBusca = it.hasNext() ? it.next() : origem.createFolder(String(a.numero_req));
    }
    const arquivos = pastaBusca.getFilesByName(nomeArquivo);
    if (!arquivos.hasNext()) { Logger.log("AUSENTE: " + caminho); return; }

    const arquivo = arquivos.next();
    const driveId = arquivo.getId();

    audit.getRange(a.__linha__, 5).setValue(driveId); /* coluna drive_file_id */
    enviados++;
  });

  Logger.log("Anexos mapeados ao Drive: " + enviados + " de " + linhas.length);
}

/* ------------------------------------------------------------- execução */

function rodarMigracaoCompleta() {
  importarUsuarios();
  importarPedidos();
  importarHistorico();
  importarAuditAnexos();
  Logger.log("Migração de dados concluída! Rode enviarAnexosAoDrive() com a pasta de anexos.");
}
