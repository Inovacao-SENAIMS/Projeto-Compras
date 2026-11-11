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

  /* Mapa ação → REST (Task 3). As views continuam chamando API.chamar(acao,
   * payload); este adaptador converte para endpoints RESTful com Bearer.
   * Ações fora do mapa caem no endpoint legado POST /api/{acao}. */
  function enc(v) { return encodeURIComponent(String(v ?? "")); }
  function montarQuery(p) {
    const partes = Object.entries(p || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => k + "=" + encodeURIComponent(v));
    return partes.length ? "?" + partes.join("&") : "";
  }
  const REST_MAP = {
    login: (p) => ({ m: "POST", u: "/auth/login", b: { email: p.email, senha: p.senha } }),
    cadastrarUsuario: (p) => ({ m: "POST", u: "/auth/cadastro", b: p }),
    logout: () => ({ m: "POST", u: "/auth/logout" }),
    ssoUrl: () => ({ m: "GET", u: "/auth/sso/url" }),
    solicitarResetSenha: (p) => ({ m: "POST", u: "/auth/reset/solicitar", b: { email: p.email, base_url: p.base_url } }),
    redefinirSenha: (p) => ({ m: "POST", u: "/auth/reset/redefinir", b: { token: p.token, senha: p.senha, senha2: p.senha2 } }),
    alterarSenha: (p) => ({ m: "POST", u: "/auth/senha", b: { senha_atual: p.senha_atual, senha_nova: p.senha_nova, senha_nova2: p.senha_nova2 } }),
    config: () => ({ m: "GET", u: "/config" }),
    meusDados: () => ({ m: "GET", u: "/me" }),
    listarUsuarios: () => ({ m: "GET", u: "/usuarios" }),
    criarUsuarioAdmin: (p) => ({ m: "POST", u: "/usuarios", b: p }),
    alterarGrupoUsuario: (p) => ({ m: "PATCH", u: "/usuarios/" + enc(p.email), b: { grupo: p.grupo } }),
    alterarStatusUsuario: (p) => ({ m: "PATCH", u: "/usuarios/" + enc(p.email), b: { ativo: p.ativo } }),
    excluirUsuario: (p) => ({ m: "DELETE", u: "/usuarios/" + enc(p.email) }),
    listaResponsaveis: () => ({ m: "GET", u: "/responsaveis" }),
    listarPedidos: (p) => ({ m: "GET", u: "/pedidos" + montarQuery({ status: p.status, modalidade: p.modalidade }) }),
    detalharPedido: (p) => ({ m: "GET", u: "/pedidos/" + enc(p.numero) }),
    criarPedido: (p) => ({ m: "POST", u: "/pedidos", b: p }),
    enviarPedido: (p) => ({ m: "POST", u: "/pedidos/" + enc(p.numero) + "/enviar" }),
    assumirPedido: (p) => ({ m: "POST", u: "/pedidos/" + enc(p.numero) + "/assumir" }),
    designarPedido: (p) => ({ m: "POST", u: "/pedidos/" + enc(p.numero) + "/designar", b: { responsavel: p.responsavel } }),
    tramitarPedido: (p) => ({ m: "POST", u: "/pedidos/" + enc(p.numero) + "/tramitar", b: { status: p.status, retorno_final: p.retorno_final, observacao: p.observacao, modalidade: p.modalidade } }),
    excluirPedido: (p) => ({ m: "DELETE", u: "/pedidos/" + enc(p.numero) }),
    listarAnexos: (p) => ({ m: "GET", u: "/pedidos/" + enc(p.numero) + "/anexos" }),
    anexarArquivo: (p) => ({ m: "POST", u: "/pedidos/" + enc(p.numero) + "/anexos", b: { tipo: p.tipo, nome_original: p.nome_original, base64: p.base64 } }),
    listarDocumentos: () => ({ m: "GET", u: "/documentos" }),
    dashboard: () => ({ m: "GET", u: "/dashboard" }),
    performance: (p) => ({ m: "GET", u: "/performance" + montarQuery({ de: p.de, ate: p.ate, usuario: p.usuario }) }),
  };

  function cabecalhos(token) {
    const h = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  async function fetchComTimeout(url, opcoes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      return await fetch(url, { ...opcoes, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** baixarArquivo via REST binário → converte para o envelope base64
   *  que as views esperam ({nome, mime, base64}). */  async function baixarArquivoRest(payload, token) {
    try {
      const r = await fetchComTimeout(
        urlBase() + "/anexos/" + enc(payload.id) + "/arquivo",
        { method: "GET", headers: cabecalhos(token) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return { ok: false, erro: err.detail || "HTTP " + r.status };
      }
      const blob = await r.blob();
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const s = String(fr.result || "");
          const virg = s.indexOf(",");
          resolve(virg >= 0 ? s.slice(virg + 1) : s);
        };
        fr.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        fr.readAsDataURL(blob);
      });
      /* nome do header Content-Disposition (filename* UTF-8 tem prioridade) */
      let nome = payload.nome || "anexo";
      const cd = r.headers.get("Content-Disposition") || "";
      let m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      if (m) nome = decodeURIComponent(m[1]);
      else if ((m = /filename="([^"]+)"/i.exec(cd))) nome = m[1];
      return { ok: true, data: { nome, mime: blob.type || "application/octet-stream", base64: b64 } };
    } catch (e) {
      return { ok: false, erro: e && e.name === "AbortError"
        ? "A API não respondeu (tempo esgotado). Tente novamente."
        : "Falha de conexão com a API. Verifique se o serviço está no ar." };
    }
  }

  /** Chamada REST (Task 3): retorna o mesmo envelope {ok, data|erro}. */
  async function chamarRest(acao, payload, token) {
    if (acao === "baixarArquivo") return baixarArquivoRest(payload, token);
    const map = REST_MAP[acao];
    if (!map && acao !== "baixarArquivo") {
      return { ok: false, erro: "Ação desconhecida: " + acao };
    }

    const { m, u, b } = map(payload);
    try {
      const r = await fetchComTimeout(urlBase() + u, {
        method: m,
        headers: cabecalhos(token),
        body: b !== undefined ? JSON.stringify(b) : undefined,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return { ok: false, erro: err.detail || ("HTTP " + r.status) };
      }
      const data = r.status === 204 ? null : await r.json();
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        erro: e && e.name === "AbortError"
          ? "A API não respondeu (tempo esgotado). Tente novamente."
          : "Falha de conexão com a API. Verifique se o serviço está no ar.",
      };
    }
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
        const resp = await chamarRest(acao, payload, tokenReal);

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
