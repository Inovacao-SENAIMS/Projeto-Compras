/* Configuração global da SPA.
 *
 * Preencha API_URL com a URL do Apps Script Web App (deploy "Executar como: eu"
 * / acesso "Qualquer pessoa"), terminando em /exec:
 *   https://script.google.com/macros/s/<DEPLOY_ID>/exec
 */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwl1ZifI-xmVLDoClu5Db5Aj5VomWZ7u52n9RW2SdH3brV4sYabQV1zg8oZe90Vcw2C/exec",

  /* Expiração da sessão (ms) — deve ser <= expiração definida no Apps Script */
  SESSAO_MS: 8 * 60 * 60 * 1000,

  /* Domínio institucional obrigatório */
  DOMINIO_EMAIL: "@ms.senai.br",

  /* Tamanho máximo de anexo (bytes) — deve bater com a validação server-side */
  ANEXO_MAX_BYTES: 10 * 1024 * 1024,

  /* Extensões aceitas para anexos (validação client-side espelha a do server) */
  ANEXO_EXTENSOES: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".png", ".jpg", ".jpeg", ".txt", ".zip"],

  /* Ministérios/rótulos de instituto (cadastro e gráfico por instituto) */
  INSTITUTOS: [
    "IST Alimentos e Bebidas - Dourados",
    "ISI Biomassa - Três Lagoas",
    "IST Eficiência Operacional - Campo Grande",
    "SENAI MS - Departamento Regional",
  ],

  /* Modalidades RCA (igual ao Django: pedidos.models.Modalidade) */
  MODALIDADES: {
    selecao_com_disputa_aberta: "Seleção com Disputa (Aberta)",
    selecao_com_disputa_fechada: "Seleção com Disputa (Fechada)",
    selecao_sem_disputa_dispensa: "Seleção sem Disputa (Dispensa)",
    selecao_sem_disputa_inexigibilidade: "Seleção sem Disputa (Inexigibilidade)",
    credenciamento: "Credenciamento",
    pre_qualificacao: "Pré-qualificação",
    dialogo_previo: "Diálogo Prévio",
    registro_preco: "Registro de Preço",
  },

  /* Urgências (igual ao Django: pedidos.models.Urgencia) */
  URGENCIAS: {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
    critica: "Crítica",
  },

  /* Status (igual ao Django: pedidos.models.Status) */
  STATUS: {
    aberta: "Aberta",
    enviada: "Enviada",
    em_analise: "Em Análise",
    concluida: "Concluída",
    cancelada: "Cancelada",
  },
};
