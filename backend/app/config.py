"""
config.py — configuração central da API (fonte de verdade para o frontend).

Tudo configurável por variáveis de ambiente (docker-compose). Os mapas
INSTITUTOS/MODALIDADES/URGENCIAS/STATUS espelham o Django e o Config.gs.
"""
import os

# ---------------------------------------------------------------- pastas/dados
DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(DATA_DIR, "compras.db"))
ANEXOS_DIR = os.environ.get("ANEXOS_DIR", os.path.join(DATA_DIR, "anexos"))

# ---------------------------------------------------------------- sessão/admin
SESSAO_MINUTOS = int(os.environ.get("SESSAO_MINUTOS", "480"))  # 8h, igual ao Apps Script
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@ms.senai.br").strip().lower()
ADMIN_SENHA_PADRAO = os.environ.get("ADMIN_SENHA_PADRAO", "admin123")
SEED_ADMIN = os.environ.get("SEED_ADMIN", "true").lower() != "false"

# ---------------------------------------------------------------- e-mail institucional
DOMINIO_EMAIL = os.environ.get("DOMINIO_EMAIL", "ms.senai.br")

# ---------------------------------------------------------------- anexos
ANEXO_MAX_BYTES = int(os.environ.get("ANEXO_MAX_BYTES", str(10 * 1024 * 1024)))
ANEXO_EXTENSOES = [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv",
    ".png", ".jpg", ".jpeg", ".txt", ".zip",
]

# ---------------------------------------------------------------- SSO (Microsoft Entra ID / OIDC)
OIDC_ENABLED = os.environ.get("OIDC_ENABLED", "false").lower() != "false"
# Ex.: https://login.microsoftonline.com/<TENANT-ID>/v2.0
OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "")
OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "")
OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "")
# Base do SPA para o callback redirecionar (ex.: https://compras.suaempresa.com.br)
OIDC_SPA_BASE = os.environ.get("OIDC_SPA_BASE", "")
OIDC_SCOPES = os.environ.get("OIDC_SCOPES", "openid profile email")
# Chave para assinar o `state` do OAuth (obrigatória com SSO; gera aleatória
# por boot se ausente — estados pendentes são invalidados a cada restart)
SECRET_KEY = os.environ.get("SECRET_KEY", "")

# ---------------------------------------------------------------- reset de senha
RESET_VALIDADE_MIN = int(os.environ.get("RESET_VALIDADE_MIN", "30"))
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USUARIO = os.environ.get("SMTP_USUARIO", "")
SMTP_SENHA = os.environ.get("SMTP_SENHA", "")
SMTP_DE = os.environ.get("SMTP_DE", "projeto-compras@ms.senai.br")
SMTP_TLS = os.environ.get("SMTP_TLS", "true").lower() != "false"

# ---------------------------------------------------------------- domínio de negócio (espelha Django/Config.gs)
INSTITUTOS = [
    "IST Alimentos e Bebidas - Dourados",
    "ISI Biomassa - Três Lagoas",
    "IST Eficiência Operacional - Campo Grande",
    "SENAI MS - Departamento Regional",
]

MODALIDADES = {
    "selecao_com_disputa_aberta": "Seleção com Disputa (Aberta)",
    "selecao_com_disputa_fechada": "Seleção com Disputa (Fechada)",
    "selecao_sem_disputa_dispensa": "Seleção sem Disputa (Dispensa)",
    "selecao_sem_disputa_inexigibilidade": "Seleção sem Disputa (Inexigibilidade)",
    "credenciamento": "Credenciamento",
    "pre_qualificacao": "Pré-qualificação",
    "dialogo_previo": "Diálogo Prévio",
    "registro_preco": "Registro de Preço",
}

URGENCIAS = {"baixa": "Baixa", "media": "Média", "alta": "Alta", "critica": "Crítica"}

STATUS = {
    "aberta": "Aberta",
    "enviada": "Enviada",
    "em_analise": "Em Análise",
    "concluida": "Concluída",
    "cancelada": "Cancelada",
}
