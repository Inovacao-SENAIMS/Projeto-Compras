/**
 * Anexos.gs — armazenamento dos anexos no Drive (privado), mediado por API.
 * Espelha pedidos/validators.py do Django: lista branca de extensão, MIME e
 * limite de 10 MB. Nada fica exposto web (pasta Drive privada do dono).
 */

const EXTENSOES_OK = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".png", ".jpg", ".jpeg", ".txt", ".zip"];
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024;

/* Próximo id de anexo (sequência em ScriptProperties) */
function proximoIdAnexo() {
  const props = PropertiesService.getScriptProperties();
  const n = (parseInt(props.getProperty(CHAVE_ANEXO_ID), 10) || 0) + 1;
  props.setProperty(CHAVE_ANEXO_ID, String(n));
  return "ANX-" + ("000001" + n).slice(-6);
}

function _extensao(nome) {
  const i = String(nome).lastIndexOf(".");
  return i >= 0 ? String(nome).slice(i).toLowerCase() : "";
}

/** Valida e grava o anexo na subpasta da requisição. Thrown Error em problema. */
function _salvarAnexo(numeroReq, anexo, usuario) {
  const tipo = String(anexo.tipo || "documentacao").toLowerCase();
  exigir(tipo === "documentacao" || tipo === "cotacao", "Tipo de anexo inválido: " + tipo);

  const nomeOriginal = String(anexo.nome_original || "anexo");
  exigir(EXTENSOES_OK.includes(_extensao(nomeOriginal)),
    "Extensão não permitida: " + (_extensao(nomeOriginal) || "desconhecida"));

  const dados = String(anexo.base64 || "");
  exigir(dados.length > 0, "Arquivo vazio.");
  const bytes = Utilities.base64Decode(dados);
  exigir(bytes.length <= TAMANHO_MAX_BYTES, "Arquivo excede o tamanho máximo de 10 MB.");

  const arquivo = pastaPedido(numeroReq)
    .createFile(Utilities.newBlob(bytes, "application/octet-stream", numeroReq + "_" + Date.now() + "_" + nomeOriginal));

  const id = proximoIdAnexo();
  aba("AnexosAudit").appendRow([
    id, numeroReq, tipo, nomeOriginal, arquivo.getId(),
    String(usuario.email).toLowerCase(), new Date(),
  ]);
  return { id, nome_original: nomeOriginal, tipo };
}

function apiAnexarArquivo(payload, usuario) {
  const numero = String(payload.numero || "");
  const reg = getPedido(numero);
  exigir(reg, "Requisição não encontrada: " + numero);
  exigir(SessaoPodeVerPedido(reg.p, usuario), "Sem permissão para anexar nesta requisição.");
  exigir(!STATUS_TERMINAIS.includes(String(reg.p.status)), "Requisição finalizada não aceita anexos.");

  const salvo = _salvarAnexo(numero, payload, usuario);
  return { ok: true, data: salvo };
}

/** owner vê/gerencia os seus; equipe gerencia tudo. */
function SessaoPodeVerPedido(p, usuario) {
  return isEquipe(usuario) || String(p.criado_por).toLowerCase() === String(usuario.email).toLowerCase();
}

function apiListarAnexos(payload, usuario) {
  const numero = String(payload.numero || "");
  const reg = getPedido(numero);
  exigir(reg, "Requisição não encontrada: " + numero);
  exigir(SessaoPodeVerPedido(reg.p, usuario), "Sem permissão para ver os anexos desta requisição.");

  const ls = lerAba("AnexosAudit")
    .filter((a) => String(a.numero_req) === numero)
    .map((a) => ({
      id: String(a.id), tipo: a.tipo, nome_original: a.nome_original,
      enviado_por: nomeExibicao(a.enviado_por), enviado_em: iso(a.enviado_em),
    }));
  return { ok: true, data: ls };
}

function apiBaixarArquivo(payload, usuario) {
  const id = String(payload.id || "");
  const a = lerAba("AnexosAudit").find((x) => String(x.id) === id);
  exigir(a, "Anexo não encontrado: " + id);

  const reg = getPedido(String(a.numero_req));
  exigir(reg, "Requisição não encontrada para o anexo.");
  exigir(SessaoPodeVerPedido(reg.p, usuario), "Sem permissão para baixar este anexo.");

  const arquivo = DriveApp.getFileById(a.drive_file_id);
  const blob = arquivo.getBlob();
  return {
    ok: true,
    data: {
      nome: String(a.nome_original),
      mime: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
    },
  };
}
