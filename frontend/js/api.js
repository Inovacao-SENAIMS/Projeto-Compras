/* Camada de comunicação com a API (FastAPI, container Docker).
 *
 * TRANSPORTE: fetch direto para /api/{acao} (mesma origem, via proxy do nginx).
 * Substitui a Bridge (iframe + postMessage) do Apps Script — sem CORS,
 * sem redirect e com latência de rede local.
 *
 * Protocolo: POST {token, payload} → envelope {ok, data|erro} (idêntico ao
 * antigo Apps Script, então as views não mudaram).
 */
const API = (() => {
  /** Evento para "sessão expirou" (o app ouve e volta ao login). */
  const EV_SESSAO_EXPIRADA = "api:sessao-expirada";

  /* Cache curto de LEITURAS: invalidado a cada escrita. */
  const CACHE_MS = 30000;
  const CACHEAVEIS = {
    listarPedidos: 1, detalharPedido: 1, dashboard: 1, performance: 1,
    meusDados: 1, listarUsuarios: 1, listaResponsaveis: 1, listarAnexos: 1,
  };
  const cache = new Map();     // chave -> { t, resp }
  const emVoo = new Map();     // chave -> Promise (deduplica chamadas simultâneas)

  function chaveCache(acao, token, payload) {
    return acao + "|" + (token || "") + "|" + JSON.stringify(payload || {});
  }

  /* ------------------------- loader global ------------------------- */

  const ACOES_ESCRITA = {
    criarPedido: 1, enviarPedido: 1, assumirPedido: 1, designarPedido: 1,
    tramitarPedido: 1, excluirPedido: 1, anexarArquivo: 1,
    criarUsuarioAdmin: 1, alterarGrupoUsuario: 1, alterarStatusUsuario: 1,
    excluirUsuario: 1,
  };

  let cargasAtivas = 0;
  let escritasAtivas = 0;
  let timerBarra = null;
  let timerOverlay = null;

  function garantirLoader() {
    if (qs("#loader-global")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="loader-global" aria-hidden="true"><span class="loader-barra"></span></div>
      <div id="loader-overlay" hidden>
        <div class="loader-caixa">
          <span class="loader-spinner" aria-hidden="true"></span>
          <span>Processando…</span>
        </div>
      </div>`);
  }

  function iniciarCarga(escrita) {
    garantirLoader();
    cargasAtivas++;
    if (cargasAtivas === 1) {
      timerBarra = setTimeout(() => {
        const el = qs("#loader-global");
        if (el) el.classList.add("ativo");
      }, 150);
    }
    if (escrita) {
      escritasAtivas++;
      if (escritasAtivas === 1) {
        timerOverlay = setTimeout(() => {
          const el = qs("#loader-overlay");
          if (el) el.hidden = false;
        }, 350);
      }
    }
  }

  function finalizarCarga(escrita) {
    cargasAtivas = Math.max(0, cargasAtivas - 1);
    if (cargasAtivas === 0) {
      clearTimeout(timerBarra);
      timerBarra = null;
      const el = qs("#loader-global");
      if (el) el.classList.remove("ativo");
    }
    if (escrita) {
      escritasAtivas = Math.max(0, escritasAtivas - 1);
      if (escritasAtivas === 0) {
        clearTimeout(timerOverlay);
        timerOverlay = null;
        const el = qs("#loader-overlay");
        if (el) el.hidden = true;
      }
    }
  }

  /* ------------------------- API pública ------------------------- */

  /** Base da API: vazio = mesma origem (/api, proxy do nginx);
   *  para dev apontando ao uvicorn direto, use "http://localhost:8000/api". */
  function urlBase() {
    const u = String(CONFIG.API_URL || "").trim();
    return u ? u.replace(/\/+$/, "") : "/api";
  }

  async function chamar(acao, payload = {}, token = null) {
    const tokenReal = token === null ? (Sessao.ler() || {}).token : token;
    const chave = chaveCache(acao, tokenReal, payload);

    /* 1) cache de leitura */
    if (CACHEAVEIS[acao]) {
      const c = cache.get(chave);
      if (c && Date.now() - c.t < CACHE_MS) return c.resp;
      /* 2) deduplica chamadas idênticas simultâneas */
      if (emVoo.has(chave)) return emVoo.get(chave);
    }

    const execucao = (async () => {
      const escrita = !!ACOES_ESCRITA[acao];
      iniciarCarga(escrita);
      try {
        let resp;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 60000);
          const r = await fetch(urlBase() + "/" + encodeURIComponent(acao), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: tokenReal || "", payload }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          resp = await r.json().catch(() => ({ ok: false, erro: "Resposta inválida da API." }));
        } catch (e) {
          resp = {
            ok: false,
            erro: e && e.name === "AbortError"
              ? "A API não respondeu (tempo esgotado). Tente novamente."
              : "Falha de conexão com a API. Verifique se o serviço está no ar.",
          };
        }

        if (resp.ok === false && /sess[iã]o expirada/i.test(resp.erro || "")) {
          Sessao.limpar();
          document.dispatchEvent(new CustomEvent(EV_SESSAO_EXPIRADA, { detail: resp.erro }));
        }

        if (resp.ok) {
          if (CACHEAVEIS[acao]) cache.set(chave, { t: Date.now(), resp });
          else cache.clear(); /* escrita: invalida leituras */
        }
        return resp;
      } finally {
        finalizarCarga(escrita);
      }
    })();

    if (CACHEAVEIS[acao]) emVoo.set(chave, execucao);
    try {
      return await execucao;
    } finally {
      if (CACHEAVEIS[acao]) emVoo.delete(chave);
    }
  }

  /* ------------------------- anexos ------------------------- */

  /** Converte um arquivo em base64 (sem prefixo data:) p/ envio na API. */
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
