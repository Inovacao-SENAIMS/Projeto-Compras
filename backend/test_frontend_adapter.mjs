/**
 * test_frontend_adapter.mjs — valida o adapter REST do api.js REAL do frontend
 * contra o stack Docker rodando (Caddy → nginx → FastAPI), executando o fluxo
 * completo do negócio exatamente como as views fazem (API.chamar).
 *
 * Rodar: node backend/test_frontend_adapter.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // cert interno do Caddy em dev

const BASE = process.env.BASE_URL || "https://localhost/api";

/* ------- stubs mínimos de DOM que o api.js usa ------- */
const ctx = {
  console, setTimeout, clearTimeout, fetch,
  AbortController, URLSearchParams,
  CONFIG: undefined,
  Sessao: {
    token: null,
    ler() { return this.token ? { token: this.token } : null; },
    limpar() { this.token = null; },
  },
  qs: () => null,
  document: {
    addEventListener() {}, dispatchEvent() {},
    body: { insertAdjacentHTML() {}, appendChild() {} },
    getElementById() { return null; }, createElement() { return {}; },
  },
  window: {},
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
  Buffer,
  Blob,
  TextEncoder,
  FileReader: class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = "data:;base64," + Buffer.from(new Uint8Array(buf)).toString("base64");
        this.onload && this.onload();
      }, (e) => {
        this.onerror && this.onerror(e);
      });
    }
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync("frontend/js/config.js", "utf8") +
  `\nCONFIG.API_URL = ${JSON.stringify(BASE)};\n` +
  fs.readFileSync("frontend/js/api.js", "utf8"), ctx);

const API = vm.runInContext("API", ctx);
const Sessao = vm.runInContext("Sessao", ctx);
let falhas = 0;
const check = (n, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${n} ${extra}`);
  if (!cond) falhas++;
};

const pdf = Buffer.from("%PDF-1.4 adapter").toString("base64");
const USUARIO = "adapter@ms.senai.br";
const SENHA = "senha123";

console.log("— fluxo completo via adapter REST (" + BASE + ") —");
const cfg = await API.chamar("config");
check("config pública", cfg.ok);

const login = await API.chamar("login", { email: "admin@ms.senai.br", senha: "admin123" });
check("login admin (REST)", login.ok, login.erro || "");
Sessao.token = login.data.token;
const adm = login.data.token;

check("meusDados", (await API.chamar("meusDados")).ok);

const cad = await API.chamar("cadastrarUsuario", {
  email: USUARIO, nome_completo: "Ada Adapter", senha: SENHA, senha2: SENHA,
  instituto: "ISI Biomassa - Três Lagoas",
});
check("cadastrarUsuario (ou já existe de run anterior)",
  cad.ok || /existe/i.test(cad.erro || ""), cad.erro || "");

const loginU = await API.chamar("login", { email: USUARIO, senha: SENHA });
Sessao.token = loginU.data.token;
check("login do novo usuário", loginU.ok);

const criar = await API.chamar("criarPedido", {
  produto: "Teclado", quantidade: 5, modalidade: "credenciamento",
  urgencia: "baixa", possui_cotacao: false,
  anexos: [{ tipo: "documentacao", nome_original: "doc adapt.pdf", base64: pdf }],
});
check("criarPedido", criar.ok && criar.data.numero, criar.erro || criar.erro || "");
const num = criar.data.numero;
check("número REQ-00000x", /^REQ-\d{6}$/.test(num), num);

check("detalharPedido",
  (await API.chamar("detalharPedido", { numero: num })).ok);

Sessao.token = adm;
const grupo = await API.chamar("alterarGrupoUsuario", { email: USUARIO, grupo: "Time_Compras" });
check("alterarGrupoUsuario (gestão)", grupo.ok, grupo.erro || "");

Sessao.token = loginU.data.token;
check("enviarPedido", (await API.chamar("enviarPedido", { numero: num })).ok);

const assumir = await API.chamar("assumirPedido", { numero: num });
check("assumirPedido (agora é time)", assumir.ok, assumir.erro || "");

const tramitar = await API.chamar("tramitarPedido", {
  numero: num, status: "concluida", retorno_final: "Feito via adapter.",
});
check("tramitarPedido", tramitar.ok, tramitar.erro || "");

/* relatórios da gestão exigem token admin de novo */
Sessao.token = adm;
const perf = await API.chamar("performance", {});
check("performance (admin/gestão)", perf.ok && perf.data.indicadores.total >= 1,
  perf.erro || "");
const dash = await API.chamar("dashboard", {});
check("dashboard", dash.ok && dash.data.total >= 1);

const anexos = await API.chamar("listarAnexos", { numero: num });
check("listarAnexos", anexos.ok && anexos.data.length === 1);
const dl = await API.chamar("baixarArquivo", { id: anexos.data[0].id });
check("baixarArquivo (binário→base64)",
  dl.ok && Buffer.from(dl.data.base64, "base64").toString() === "%PDF-1.4 adapter",
  dl.erro || "");
check("nome do arquivo do Content-Disposition",
  dl.data.nome === "doc adapt.pdf", dl.data?.nome);

const docs = await API.chamar("listarDocumentos", {});
check("listarDocumentos", docs.ok && docs.data.length >= 1);

check("listaResponsaveis", (await API.chamar("listaResponsaveis")).ok);
Sessao.token = adm; /* listarUsuarios é exclusivo da Gestão */
const us = await API.chamar("listarUsuarios", {});
check("listarUsuarios", us.ok && us.data.some(u => u.email === USUARIO),
  us.erro || "");

/* escrita → cache deve limpar; leitura deve refletir novo estado */
Sessao.token = adm;
const nova = await API.chamar("criarPedido", {
  produto: "Mouse", modalidade: "registro_preco",
  anexos: [{ tipo: "documentacao", nome_original: "d.pdf", base64: pdf }],
});
check("2º pedido (cache invalidado)", nova.ok, nova.erro || "");

const ex = await API.chamar("excluirPedido", { numero: nova.data.numero });
check("excluirPedido (dono admin)", ex.ok, ex.erro || "");

console.log();
if (falhas) { console.log("FALHAS:", falhas); process.exit(1); }
console.log("ADAPTER: TODOS OS TESTES PASSARAM ✔");
