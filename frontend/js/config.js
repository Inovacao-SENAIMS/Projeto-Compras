/* Configuração global da SPA.
 *
 * API_URL vazio = mesma origem (o nginx faz proxy de /api para o container
 * FastAPI). Para desenvolvimento fora do Docker, aponte ao uvicorn direto:
 *   API_URL: "http://localhost:8000/api"
 */
const CONFIG = {
  API_URL: "",

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
