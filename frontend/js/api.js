/* Camada de comunicação com a API (Apps Script Web App).
 *
 * TRANSPORTE: iframe oculto + postMessage → google.script.run.
 * Por que não fetch? O /exec do Apps Script responde 302 para
 * script.googleusercontent.com e o navegador converte o POST em GET,
 * perdendo o corpo — a API nunca recebe o payload. A página Bridge.html
 * (no projeto Apps Script) resolve: rota na origem do server e usa
 * google.script.run (mecanismo oficial), sem CORS nem redirect.
 *
 * Protocolo (página Bridge.html do projeto Apps Script):
 *   parent → bridge : { type: "API_CALL",  id, action, token, payload }
 *   bridge → parent : { type: "BRIDGE_READY" } no load;
 *                     { type: "API_RESP", id, resp } para cada chamada.
 */
const API = (() => {
  /** Evento para "sessão expirou" (o app ouve e volta ao login). */
  const EV_SESSAO_EXPIRADA = "api:sessao-expirada";

  let iframe = null;
  let pronto = false;
  let fonte = null;            // window interna do painel (quem mandou BRIDGE_READY)
  let fila = [];               // chamadas aguardando o READY da bridge
  const pendentes = new Map(); // id -> { resolve, timer }
  let seq = 0;

  /* Cache curto de LEITURAS: navegar entre telas deixa de repetir a ida ao
   * Google (cada chamada custa 2–7 s). É invalidado a cada escrita. */
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

  /* ------------------------- infraestrutura ------------------------- */

  function criarIframe() {
    return new Promise((resolve, reject) => {
      if (!CONFIG.API_URL) {
        reject(new Error("API_URL não configurada (edite docs/js/config.js)."));
        return;
      }

      iframe = document.createElement("iframe");
      iframe.src = CONFIG.API_URL;
      iframe.style.display = "none";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      /* Watchdog: bridge não carregou (URL errada / deploy desatualizado) */
      const watchdog = setTimeout(() => {
        if (!pronto) {
          reject(new Error(
            "A ponte da API não carregou. Verifique: (1) CONFIG.API_URL terminando em /exec; " +
            "(2) deploy atualizado (Executar como: Me, acesso: Anyone); " +
            "(3) arquivo Bridge.html presente no projeto Apps Script."));
        }
      }, 30000);

      window.addEventListener("message", (ev) => {
        const m = ev.data;
        if (!m) return;
        /* Apenas origens oficiais do Apps Script podem responder pela bridge */
        if (ev.origin &&
            !/^https:\/\/script\.google(com|usercontent)\.com$/i.test(ev.origin)) {
          return;
        }

        if (m.type === "BRIDGE_READY") {
          if (ev.source) fonte = ev.source; /* painel interno do HtmlService */
          if (!pronto) {
            pronto = true;
            clearTimeout(watchdog);
            fila.splice(0).forEach(enviarReal);
            resolve();
          }
          return;
        }

        if (m.type === "API_RESP" && pendentes.has(m.id)) {
          const item = pendentes.get(m.id);
          pendentes.delete(m.id);
          clearTimeout(item.timer);
          item.resolve(m.resp || { ok: false, erro: "Resposta vazia da API." });
        }
      });
    });
  }

  function enviarReal(item) {
    pendentes.set(item.id, item);
    const alvo = fonte || (iframe && iframe.contentWindow);
    if (!alvo) {
      item.resolve({ ok: false, erro: "Ponte da API indisponível. Recarregue a página." });
      return;
    }
    alvo.postMessage(
      { type: "API_CALL", id: item.id, action: item.acao, token: item.token, payload: item.payload },
      "*"
    );
    item.timer = setTimeout(() => {
      if (pendentes.has(item.id)) {
        pendentes.delete(item.id);
        item.resolve({ ok: false, erro: "A API não respondeu (tempo esgotado). Tente novamente." });
      }
    }, 60000);
  }

  /* ------------------------- loader global -------------------------
   * Feedback visual para o usuário durante as chamadas (o Apps Script leva
   * alguns segundos). Barra no topo para qualquer chamada e overlay
   * "Processando…" para gravações (evita duplo clique). */
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

  async function chamar(acao, payload = {}, token = null) {
    if (!CONFIG.API_URL) {
      return { ok: false, erro: "API_URL não configurada (edite docs/js/config.js)." };
    }
    if (!iframe) {
      try {
        await criarIframe();
      } catch (e) {
        iframe = null;
        return { ok: false, erro: e.message };
      }
    }

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
        const item = {
          id: "req-" + (++seq) + "-" + Date.now(),
          acao,
          token: tokenReal || "",
          payload,
        };

        const resp = await new Promise((resolve) => {
          item.resolve = resolve;
          if (pronto) enviarReal(item);
          else fila.push(item);
        });

        if (resp.ok === false && /sess[iã]o expirada/i.test(resp.erro || "")) {
          Sessao.limpar();
          document.dispatchEvent(new CustomEvent(EV_SESSAO_EXPIRADA, { detail: resp.erro }));
        }

        /* Diagnóstico amigável: ação nova ainda não publicada no Apps Script */
        if (resp.ok === false && /a[cç][aã]o desconhecida/i.test(resp.erro || "")) {
          resp.erro = resp.erro +
            " — o deploy do Apps Script parece desatualizado: atualize Code.gs e " +
            "Usuarios.gs e publique uma NOVA VERSÃO (Implantar → Gerenciar implantações → ✏️ → Nova versão).";
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
