"""Validação de arquivos enviados (extensão, tipo e tamanho)."""

from pathlib import Path

from django.core.exceptions import ValidationError

# Tamanho máximo por arquivo: 10 MB.
TAMANHO_MAXIMO = 10 * 1024 * 1024

EXTENSOES_PERMITIDAS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".png",
    ".jpg",
    ".jpeg",
    ".txt",
    ".csv",
    ".zip",
}

# Tipos MIME aceitos. `application/octet-stream` é tolerado porque alguns
# navegadores não informam o tipo real em certos contextos.
TIPOS_PERMITIDOS = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "text/plain",
    "text/csv",
    "application/csv",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
}


def validar_arquivo(arquivo):
    """Valida extensão, tipo e tamanho de um arquivo enviado."""
    if not arquivo:
        return

    nome = getattr(arquivo, "name", "") or ""
    extensao = Path(nome).suffix.lower()

    if extensao not in EXTENSOES_PERMITIDAS:
        permitidas = ", ".join(sorted(EXTENSOES_PERMITIDAS))
        raise ValidationError(
            f"Extensão '{extensao or '(sem extensão)'}' não permitida. "
            f"Extensões aceitas: {permitidas}."
        )

    tipo = getattr(arquivo, "content_type", "") or ""
    if tipo and tipo not in TIPOS_PERMITIDOS:
        raise ValidationError(f"Tipo de arquivo não permitido: {tipo}.")

    tamanho = getattr(arquivo, "size", 0) or 0
    if tamanho <= 0:
        raise ValidationError("O arquivo está vazio.")
    if tamanho > TAMANHO_MAXIMO:
        limite_mb = TAMANHO_MAXIMO // (1024 * 1024)
        raise ValidationError(f"O arquivo excede o limite de {limite_mb} MB.")
