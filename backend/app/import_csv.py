"""
import_csv.py — importa os CSVs exportados da planilha "Compras_DB" para o
SQLite novo (migração Google → Docker).

Como usar:
  1. Na planilha, exporte cada aba como CSV (Arquivo → Download → CSV) usando
     os nomes: Usuarios.csv, Pedidos.csv, HistoricoStatus.csv, AnexosAudit.csv
     (opcional: Sessoes.csv e ResetSenha.csv são ignorados de propósito).
  2. Coloque os arquivos numa pasta acessível ao container, ex.:
       docker compose cp ./import compras-api:/data/import
     (ou monte um volume adicional no compose).
  3. Rode:
       docker compose exec api python -m app.import_csv /data/import
       docker compose exec api python -m app.import_csv /data/import --anexos-dir /data/import/anexos
     Fora do Docker:
       DATA_DIR=... python -m app.import_csv <pasta> [--anexos-dir <pasta>]

Comportamento:
  - Recusa importar num banco já populado (use --recriar para apagar e importar).
  - Senhas legadas (salt + SHA-256 base64, como no Apps Script) são mantidas;
    o upgrade para bcrypt acontece no 1º login de cada usuário.
  - Anexos: a auditoria é importada; os ARQUIVOS em si, se você baixar a pasta
    do Drive, podem ser casados por nome com --anexos-dir (o Apps Script gravou
    os arquivos como "REQ-xxxxxx_<timestamp>_<nome_original>"; também aceita
    arquivos nomeados pelo drive_file_id). Sem arquivo, o download do anexo
    responde "Arquivo indisponível no armazenamento".
  - Todo o import roda numa única transação: ou importa tudo, ou nada.
"""
import argparse
import base64
import csv
import hashlib
import os
import re
import sys
from datetime import datetime

from sqlalchemy import select

from . import config
from .database import Base, SessionLocal, engine
from .models import Anexo, HistoricoStatus, Pedido, Usuario
from .seed import garantir_admin

# Cabeçalhos esperados (iguais ao Setup.gs / Utils.gs)
CABECALHOS = {
    "Usuarios": ["nome_completo", "email", "grupo", "senha_hash", "salt",
                 "area_atuacao", "cargo", "instituto", "telefone", "ramal", "ativo"],
    "Pedidos": ["numero", "produto", "descricao_objeto", "quantidade", "modalidade",
                "urgencia", "possui_cotacao", "solicitante_nome", "criado_por",
                "data_envio", "status", "responsavel", "retorno_final",
                "criado_em", "atualizado_em", "assumido_em", "concluido_em"],
    "HistoricoStatus": ["numero_req", "de", "para", "usuario", "observacao", "criado_em"],
    "AnexosAudit": ["id", "numero_req", "tipo", "nome_original", "drive_file_id",
                    "enviado_por", "enviado_em"],
}

FORMATOS_DATA = [
    "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
]

AVISO_AMBIGUO = ("Datas d/m vs m/d ambíguas no CSV; assumindo d/m/Y (locale BR). "
                 "Use IMPORT_LOCALE=US se o Sheets exportou em formato americano.")


def _txt(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    # CSV do Sheets pode trazer timestamps com aspas internas/vírgulas — csv já trata.
    return s


def _bool(v) -> bool:
    return str(v).strip().lower() in ("true", "verdadeiro", "sim", "1", "yes")


def _int(v, padrao=1) -> int:
    try:
        return int(float(str(v).strip() or padrao))
    except (ValueError, TypeError):
        return padrao


def _parse_data(v, aviso=None):
    s = _txt(v)
    if not s:
        return None
    for fmt in FORMATOS_DATA:
        try:
            d = datetime.strptime(s, fmt)
            return d.replace(tzinfo=None) if d.tzinfo else d
        except ValueError:
            continue
    # Ambíguo m/d vs d/m: tenta pelos dois, priorizando d/m (BR).
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$", s)
    if m:
        dia, mes = int(m.group(1)), int(m.group(2))
        if dia <= 12 and mes <= 12 and aviso is not None:
            aviso[0] = AVISO_AMBIGUO
        try:
            return datetime(int(m.group(3)), dia, mes,
                            int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0))
        except ValueError:
            pass
        try:
            return datetime(int(m.group(3)), mes, dia,
                            int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0))
        except ValueError:
            return None
    # Número serial do Excel (Sheets às vezes exporta assim)
    try:
        serial = float(s)
        if 20000 < serial < 60000:  # 1954..2064
            return datetime(1899, 12, 30) + __import__("datetime").timedelta(days=serial)
    except ValueError:
        pass
    return None


def _ler_csv(caminho):
    """Lê o CSV e devolve (linhas como dict, cabeçalho_ok)."""
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        leitor = csv.reader(f)
        try:
            cab = next(leitor)
        except StopIteration:
            return [], False
        cab = [c.strip().lstrip("\ufeff") for c in cab]
        esperado = CABECALHOS.get(os.path.basename(caminho).rsplit(".", 1)[0])
        aviso = None
        if esperado:
            faltam = [h for h in esperado if h not in cab]
            if faltam:
                aviso = f"Colunas ausentes em {os.path.basename(caminho)}: {faltam}"
        idx = {h: i for i, h in enumerate(cab)}
        linhas = []
        for bruta in leitor:
            if not any(_txt(c) for c in bruta):
                continue
            linhas.append({h: (bruta[idx[h]] if idx.get(h, -1) < len(bruta) else "") for h in cab})
    return linhas, aviso


def _achar_arquivo_anexo(anexos_dir, drive_file_id, numero_req, nome_original):
    """Localiza o arquivo do anexo baixado do Drive (opcional)."""
    if not anexos_dir or not os.path.isdir(anexos_dir):
        return None
    candidatos = [os.path.join(anexos_dir, f) for f in os.listdir(anexos_dir)]
    nome = (nome_original or "").lower()

    # 1) nome exatamente igual ao drive_file_id (exportações manuais renomeadas)
    if drive_file_id:
        for c in candidatos:
            if os.path.basename(c) == drive_file_id:
                return c
    # 2) padrão gravado pelo Apps Script: REQ-xxxxxx_<ts>_<nome_original>
    alvo = re.compile(
        r"^" + re.escape(numero_req) + r"_\d+_" + re.escape(nome) + r"$", re.IGNORECASE
    ) if numero_req and nome else None
    if alvo:
        for c in candidatos:
            if alvo.match(os.path.basename(c)):
                return c
    # 3) contém o nome original (nome pode ter sido saneado no disco)
    if nome:
        for c in candidatos:
            if numero_req.lower() in os.path.basename(c).lower() and nome in os.path.basename(c).lower():
                return c
    return None


def importar(pasta: str, anexos_dir: str | None = None, recriar: bool = False) -> dict:
    """Roda o import completo. Retorna relatório (contagens + avisos)."""
    pasta = os.path.abspath(pasta)
    arquivos = {}
    for nome in CABECALHOS:
        caminho = os.path.join(pasta, nome + ".csv")
        if not os.path.exists(caminho):
            alt = os.path.join(pasta, nome + " (planilha1).csv")
            if os.path.exists(alt):
                caminho = alt
            else:
                arquivos[nome] = []
                continue
        linhas, aviso = _ler_csv(caminho)
        arquivos[nome] = linhas
        if aviso:
            print("AVISO:", aviso)

    usuarios_csv = arquivos["Usuarios"]
    pedidos_csv = arquivos["Pedidos"]
    historico_csv = arquivos["HistoricoStatus"]
    anexos_csv = arquivos["AnexosAudit"]

    if not usuarios_csv and not pedidos_csv:
        raise SystemExit("Nada a importar: nenhum Usuarios.csv ou Pedidos.csv em " + pasta)

    Base.metadata.create_all(engine)
    db = SessionLocal()
    avisos = []
    try:
        db.begin()
        tem_dados = (db.scalar(select(Usuario.id).limit(1)) is not None
                     or db.scalar(select(Pedido.numero).limit(1)) is not None)
        if tem_dados and not recriar:
            raise SystemExit(
                "O banco já possui dados. Use --recriar para APAGAR tudo e importar "
                "(isso inclui a conta ADMIN criada no startup).")
        if recriar:
            Base.metadata.drop_all(engine)
            Base.metadata.create_all(engine)

        # ------------------------------ usuários ------------------------------
        emails_vistos = set()
        usuarios_novos = 0
        for l in usuarios_csv:
            email = _txt(l.get("email")).lower()
            if not email or email in emails_vistos:
                continue
            emails_vistos.add(email)
            db.add(Usuario(
                nome_completo=_txt(l.get("nome_completo")),
                email=email,
                grupo=_txt(l.get("grupo")) or "UserISI_IST",
                # senha legada preservada (salt + SHA-256 base64 do Apps Script)
                senha_hash=_txt(l.get("senha_hash")),
                salt=_txt(l.get("salt")),
                area_atuacao=_txt(l.get("area_atuacao")),
                cargo=_txt(l.get("cargo")),
                instituto=_txt(l.get("instituto")),
                telefone=_txt(l.get("telefone")),
                ramal=_txt(l.get("ramal")),
                ativo=not str(_txt(l.get("ativo")) or "TRUE").lower().startswith("false"),
            ))
            usuarios_novos += 1

        # ------------------------------ pedidos ------------------------------
        numeros_vistos = set()
        pedidos_novos = 0
        for l in pedidos_csv:
            numero = _txt(l.get("numero"))
            if not numero or numero in numeros_vistos:
                continue
            numeros_vistos.add(numero)
            criado = _parse_data(l.get("criado_em"), avisos) or datetime.now()
            atualizado = _parse_data(l.get("atualizado_em")) or criado
            db.add(Pedido(
                numero=numero,
                produto=_txt(l.get("produto")),
                descricao_objeto=_txt(l.get("descricao_objeto")),
                quantidade=_int(l.get("quantidade"), 1),
                modalidade=_txt(l.get("modalidade")),
                urgencia=_txt(l.get("urgencia")) or "baixa",
                possui_cotacao=_bool(l.get("possui_cotacao")),
                solicitante_nome=_txt(l.get("solicitante_nome")),
                criado_por=_txt(l.get("criado_por")).lower(),
                data_envio=_parse_data(l.get("data_envio")),
                status=_txt(l.get("status")) or "aberta",
                responsavel=_txt(l.get("responsavel")).lower(),
                retorno_final=_txt(l.get("retorno_final")),
                criado_em=criado,
                atualizado_em=atualizado,
                assumido_em=_parse_data(l.get("assumido_em")),
                concluido_em=_parse_data(l.get("concluido_em")),
            ))
            pedidos_novos += 1

        # ------------------------------ histórico ------------------------------
        historico_novos = 0
        for l in historico_csv:
            numero_req = _txt(l.get("numero_req"))
            if not numero_req:
                continue
            db.add(HistoricoStatus(
                numero_req=numero_req,
                de=_txt(l.get("de")),
                para=_txt(l.get("para")),
                usuario=_txt(l.get("usuario")).lower(),
                observacao=_txt(l.get("observacao")),
                criado_em=_parse_data(l.get("criado_em")) or datetime.now(),
            ))
            historico_novos += 1

        # ------------------------------ anexos --------------------------------
        anexos_novos, anexos_com_arquivo, anexos_sem_arquivo = 0, 0, 0
        for l in anexos_csv:
            aid = _txt(l.get("id"))
            numero_req = _txt(l.get("numero_req"))
            if not aid or not numero_req:
                continue
            drive_file_id = _txt(l.get("drive_file_id"))
            nome_original = _txt(l.get("nome_original"))
            arquivo = _achar_arquivo_anexo(anexos_dir, drive_file_id, numero_req, nome_original)
            if arquivo:
                anexos_com_arquivo += 1
            else:
                anexos_sem_arquivo += 1
            db.add(Anexo(
                id=aid, numero_req=numero_req,
                tipo=_txt(l.get("tipo")) or "documentacao",
                nome_original=nome_original,
                caminho=arquivo or "",
                enviado_por=_txt(l.get("enviado_por")).lower(),
                enviado_em=_parse_data(l.get("enviado_em")) or datetime.now(),
            ))
            anexos_novos += 1

        db.commit()

        # após (re)criar tabelas, garante a conta ADMIN (idempotente)
        if config.SEED_ADMIN:
            garantir_admin(db)

        rel = {
            "usuarios": usuarios_novos,
            "pedidos": pedidos_novos,
            "historico": historico_novos,
            "anexos": anexos_novos,
            "anexos_com_arquivo": anexos_com_arquivo,
            "anexos_sem_arquivo": anexos_sem_arquivo,
            "avisos": avisos,
        }
        return rel
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Importa CSVs da planilha Compras_DB.")
    ap.add_argument("pasta", help="Pasta com Usuarios.csv, Pedidos.csv, ...")
    ap.add_argument("--anexos-dir", help="Pasta com os arquivos de anexo baixados do Drive")
    ap.add_argument("--recriar", action="store_true",
                    help="Apaga as tabelas existentes antes de importar")
    args = ap.parse_args(argv)

    os.makedirs(config.ANEXOS_DIR, exist_ok=True)
    rel = importar(args.pasta, args.anexos_dir, args.recriar)
    print("Import concluído:")
    print(f"  usuários:            {rel['usuarios']}")
    print(f"  pedidos:             {rel['pedidos']}")
    print(f"  histórico de status: {rel['historico']}")
    print(f"  anexos (audit):      {rel['anexos']}"
          f" ({rel['anexos_com_arquivo']} com arquivo,"
          f" {rel['anexos_sem_arquivo']} sem arquivo)")
    for a in rel["avisos"]:
        print("AVISO:", a)
    if rel["anexos_sem_arquivo"]:
        print("Lembrete: anexos sem arquivo no volume respondem 'Arquivo "
              "indisponível' no download — baixe a pasta do Drive e rode "
              "novamente com --anexos-dir e --recriar.")


if __name__ == "__main__":
    main()
