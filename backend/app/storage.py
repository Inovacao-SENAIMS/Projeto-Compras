"""storage.py — anexos no volume local (substitui o Google Drive).

Mesmas regras do Anexos.gs: whitelist de extensão, 10 MB, tipo
"documentacao"|"cotacao". Arquivos em ANEXOS_DIR/REQ-xxxxxx/.
"""
import base64
import os
import re
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .deps import ErroNegocio, exigir
from .models import Anexo

_EXTENSOES_OK = config.ANEXO_EXTENSOES
_TAMANHO_MAX = config.ANEXO_MAX_BYTES


def extensao(nome: str) -> str:
    i = str(nome).rfind(".")
    return str(nome)[i:].lower() if i >= 0 else ""


def proximo_id_anexo(db: Session) -> str:
    """ANX-000001 — substitui a sequência em ScriptProperties (LockService).
    SQLite serializa gravações, o que garante unicidade na prática."""
    from sqlalchemy import func

    maior = db.scalar(
        select(func.max(Anexo.id)).where(Anexo.id.like("ANX-%"))
    )
    n = int(maior[4:] or 0) + 1 if maior else 1
    return "ANX-" + f"{n:06d}"


def salvar_anexo(db: Session, numero_req: str, anexo: dict, usuario) -> dict:
    tipo = str(anexo.get("tipo") or "documentacao").lower()
    exigir(tipo in ("documentacao", "cotacao"), f"Tipo de anexo inválido: {tipo}")

    nome_original = str(anexo.get("nome_original") or "anexo")
    ext = extensao(nome_original)
    exigir(ext in _EXTENSOES_OK, f"Extensão não permitida: {ext or 'desconhecida'}")

    dados = str(anexo.get("base64") or "")
    exigir(len(dados) > 0, "Arquivo vazio.")
    try:
        bytes_arquivo = base64.b64decode(dados, validate=False)
    except Exception:
        raise ErroNegocio("Conteúdo do anexo (base64) inválido.")
    exigir(len(bytes_arquivo) <= _TAMANHO_MAX, "Arquivo excede o tamanho máximo de 10 MB.")

    # nome seguro no disco: REQ-000001_<ts>_<nome-saneado>
    seguro = re.sub(r"[^\w.\- ]", "_", nome_original).strip() or "anexo"
    pasta = os.path.join(config.ANEXOS_DIR, numero_req)
    os.makedirs(pasta, exist_ok=True)
    nome_disco = f"{numero_req}_{int(time.time() * 1000)}_{seguro}"
    caminho = os.path.join(pasta, nome_disco)
    with open(caminho, "wb") as f:
        f.write(bytes_arquivo)

    aid = proximo_id_anexo(db)
    registro = Anexo(
        id=aid,
        numero_req=numero_req,
        tipo=tipo,
        nome_original=nome_original,
        caminho=caminho,
        enviado_por=str(usuario.email).lower(),
        enviado_em=datetime.now(timezone.utc),
    )
    db.add(registro)
    db.flush()
    return {"id": aid, "nome_original": nome_original, "tipo": tipo}


def ler_arquivo(caminho: str) -> bytes:
    with open(caminho, "rb") as f:
        return f.read()
