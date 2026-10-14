/* Camada de comunicação com a API (Apps Script Web App).
 *
 * Convenção: toda chamada é um POST "simples" (Content-Type text/plain) para
 * evitar preflight CORS; o corpo é JSON stringificado:
 *   { action: "<nome da ação>", token: "<sessão ou ''>", payload: {...} }
 * Resposta esperada: { ok: true, data: ... } ou { ok: false, erro: "..." }.
 */
const API = (() => {
  /** Chave-evento para "sessão expirou" (o roteador ouve e redireciona ao login). */
  const EV_SESSAO_EXPIRADA = "api:sessao-expirada";

  async function chamar(action, payload = {}, token = null) {
    const url = CONFIG.API_URL;
    if (!url) {
      return { ok: false, erro: "API_URL não configurada (edite site/js/config.js)." };
    }

    const tokenReal = token === null ? Sessao.token() : token;

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, token: tokenReal || "", payload }),
        // Apps Script exige redirect follow + texto igualmente válido/multa retorno:
        redirect: "follow",
      });
    } catch (e) {
      return { ok: false, erro: "Falha de rede ao contatar a API: " + e.message };
    }

    let corpo;
    try {
      corpo = await resp.json();
    } catch (e) {
      return { ok: false, erro: "Resposta inválida da API (HTTP " + resp.status + ")." };
    }

    if (corpo && corpo.ok === false && /sess[iã]o expirada|token/i.test(corpo.erro || "")) {
      Sessao.limpar();
      document.dispatchEvent(new CustomEvent(EV_SESSAO_EXPIRADA, { detail: corpo.erro }));
    }
    return corpo;
  }

  /** Converte um arquivo em base64 (sem prefixo data:) p/ upload via API. */
  function lerArquivoBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = String(r.result || "");
        const virgula = dataUrl.indexOf(",");
        resolve(virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl);
      };
      r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      r.readAsDataURL(file);
    });
  }

  /** Valida extensão e tamanho (espelha a validação server-side). */
  function validarArquivo(file) {
    const nome = (file && file.name) || "";
    const idx = nome.lastIndexOf(".");
    const ext = idx >= 0 ? nome.slice(idx).toLowerCase() : "";
    if (!ext || !CONFIG.ANEXO_EXTENSOES.includes(ext)) {
      return "Extensão não permitida: " + (ext || "desconhecida");
    }
    if (file.size > CONFIG.ANEXO_MAX_BYTES) {
      return "Arquivo excede o tamanho máximo de 10 MB.";
    }
    return "";
  }

  return { chamar, lerArquivoBase64, validarArquivo, EV_SESSAO_EXPIRADA };
})();
