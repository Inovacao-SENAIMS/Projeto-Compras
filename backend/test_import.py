"""Teste do import_csv: gera CSVs simulando a planilha Compras_DB e valida.

Cobre: usuários com senha legada (login + upgrade bcrypt), pedidos com datas
BR, histórico, anexos audit + casamento de arquivos do Drive, proteção
contra reimport, e ADMIN não duplicado.
"""
import base64
import hashlib
import os
import shutil
import sys
import tempfile
from datetime import datetime

TMP = tempfile.mkdtemp()
os.environ["DATA_DIR"] = TMP
os.environ["ANEXOS_DIR"] = os.path.join(TMP, "anexos")
os.environ["SEED_ADMIN"] = "true"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.import_csv import importar  # noqa: E402

falhas = []


def check(nome, cond, extra=""):
    ok = "✅" if cond else "❌"
    if not cond:
        falhas.append(nome)
    print(f"  {ok} {nome} {extra}")


# ---------------------------- gera CSVs de teste ----------------------------
import_dir = os.path.join(TMP, "import")
anexos_drive = os.path.join(import_dir, "anexos")
os.makedirs(anexos_drive, exist_ok=True)

salt = "9f86d081-884c-4b7b-a1e6-2c4b8f5a1e99"
senha = "senha123"
hash_legado = base64.b64encode(hashlib.sha256((salt + senha).encode()).digest()).decode()

with open(os.path.join(import_dir, "Usuarios.csv"), "w", newline="", encoding="utf-8") as f:
    f.write("nome_completo,email,grupo,senha_hash,salt,area_atuacao,cargo,instituto,telefone,ramal,ativo\n")
    f.write(f"Fernanda Souza,fernanda@ms.senai.br,UserISI_IST,{hash_legado},{salt},Área de TI,Analista,ISI Biomassa - Três Lagoas,(67) 99999-0001,1020,TRUE\n")
    f.write(f"Rafael Time,rafael@ms.senai.br,Time_Compras,{hash_legado},{salt},Compras,Comprador,SENAI MS - Departamento Regional,(67) 99999-0002,1021,TRUE\n")
    f.write("Inativo Fulano,inativo@ms.senai.br,UserISI_IST,,,TI,,IST Eficiência Operacional - Campo Grande,,,FALSE\n")

with open(os.path.join(import_dir, "Pedidos.csv"), "w", newline="", encoding="utf-8") as f:
    f.write("numero,produto,descricao_objeto,quantidade,modalidade,urgencia,possui_cotacao,"
            "solicitante_nome,criado_por,data_envio,status,responsavel,retorno_final,"
            "criado_em,atualizado_em,assumido_em,concluido_em\n")
    f.write('REQ-000001,Impressora 3D,Impressora para laboratório,2,registro_preco,alta,TRUE,'
            'Fernanda Souza,fernanda@ms.senai.br,28/05/2024 10:15:00,concluida,rafael@ms.senai.br,'
            '"Comprado conforme cotação nº 3, melhor preço.",'
            '28/05/2024 09:00:00,03/06/2024 16:40:00,29/05/2024 08:30:00,03/06/2024 16:40:00\n')
    f.write('REQ-000002,Multímetro,Multímetro digital,1,credenciamento,baixa,FALSE,'
            'Fernanda Souza,fernanda@ms.senai.br,02/06/2024 11:00:00,em_analise,rafael@ms.senai.br,,'
            '02/06/2024 10:00:00,02/06/2024 11:30:00,02/06/2024 11:30:00,\n')

with open(os.path.join(import_dir, "HistoricoStatus.csv"), "w", newline="", encoding="utf-8") as f:
    f.write("numero_req,de,para,usuario,observacao,criado_em\n")
    f.write('REQ-000001,,aberta,fernanda@ms.senai.br,"Requisição criada, com vírgula no texto.",28/05/2024 09:00:00\n')
    f.write("REQ-000001,aberta,enviada,fernanda@ms.senai.br,Requisição enviada pelo solicitante.,28/05/2024 10:15:00\n")
    f.write("REQ-000001,enviada,em_analise,rafael@ms.senai.br,Requisição assumida por Rafael Time.,29/05/2024 08:30:00\n")

with open(os.path.join(import_dir, "AnexosAudit.csv"), "w", newline="", encoding="utf-8") as f:
    f.write("id,numero_req,tipo,nome_original,drive_file_id,enviado_por,enviado_em\n")
    f.write("ANX-000001,REQ-000001,documentacao,cotacao3.pdf,1aBcDeFgH,fernanda@ms.senai.br,28/05/2024 09:00:00\n")
    f.write("ANX-000002,REQ-000001,cotacao,orcamento_fornecedor.pdf,1ZyXwVuTs,fernanda@ms.senai.br,28/05/2024 09:01:00\n")

# arquivos "baixados do Drive": no padrão gravado pelo Apps Script e pelo id
with open(os.path.join(anexos_drive, "REQ-000001_1716891600000_cotacao3.pdf"), "wb") as f:
    f.write(b"%PDF-1.4 cotacao3")
with open(os.path.join(anexos_drive, "1ZyXwVuTs"), "wb") as f:
    f.write(b"%PDF-1.4 orcamento-por-id")

print("— import —")
rel = importar(import_dir, anexos_dir=anexos_drive)
check("3 usuários", rel["usuarios"] == 3, str(rel["usuarios"]))
check("2 pedidos", rel["pedidos"] == 2, str(rel["pedidos"]))
check("3 histórico", rel["historico"] == 3, str(rel["historico"]))
check("2 anexos", rel["anexos"] == 2)
check("2 anexos com arquivo", rel["anexos_com_arquivo"] == 2,
      str(rel["anexos_com_arquivo"]))

print("— banco —")
from sqlalchemy import select  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Anexo, Pedido, Usuario  # noqa: E402

db = SessionLocal()
u = db.scalar(select(Usuario).where(Usuario.email == "fernanda@ms.senai.br"))
check("hash legado preservado", u.senha_hash == hash_legado and u.salt == salt)
check("inativo importado como FALSE",
      db.scalar(select(Usuario).where(Usuario.email == "inativo@ms.senai.br")).ativo is False)

p1 = db.get(Pedido, "REQ-000001")
check("datas BR parseadas", p1.criado_em.year == 2024 and p1.criado_em.month == 5
      and p1.criado_em.day == 28, str(p1.criado_em))
check("retorno com vírgula intacto", "cotação nº 3" in p1.retorno_final)
check("concluido_em ok", p1.concluido_em.month == 6)
check("lead time calculável", (p1.concluido_em.date() - p1.data_envio.date()).days == 6)

a1 = db.get(Anexo, "ANX-000001")
a2 = db.get(Anexo, "ANX-000002")
check("anexo 1 casado por padrão REQ_ts_nome", os.path.basename(a1.caminho) == "REQ-000001_1716891600000_cotacao3.pdf")
check("anexo 2 casado por drive_file_id", os.path.basename(a2.caminho) == "1ZyXwVuTs")
db.close()

print("— login com senha legada (upgrade bcrypt) —")
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

with TestClient(app, raise_server_exceptions=False) as c:
    r = c.post("/api/auth/login", json={"email": "fernanda@ms.senai.br", "senha": senha})
    check("login legado ok", r.status_code == 200 and r.json().get("token"),
          r.json().get("detail", ""))

    from app.database import SessionLocal as S2
    from app.models import Usuario as U2
    d2 = S2()
    u2 = d2.scalar(select(U2).where(U2.email == "fernanda@ms.senai.br"))
    check("hash virou bcrypt", u2.senha_hash.startswith("$2"))
    d2.close()

    tok = r.json()["token"]
    dash = c.get("/api/dashboard", headers={"Authorization": f"Bearer {tok}"}).json()
    check("dashboard com dados importados",
          dash["total"] == 2 and dash["concluidas"] == 1)

    dl = c.get("/api/anexos/ANX-000001/arquivo", headers={"Authorization": f"Bearer {tok}"})
    check("download do anexo importado",
          dl.status_code == 200 and dl.content == b"%PDF-1.4 cotacao3")

print("— proteção contra reimport —")
try:
    importar(import_dir)
    check("reimport recusado", False)
except SystemExit as e:
    check("reimport recusado", "já possui dados" in str(e))

print("— --recriar —")
rel2 = importar(import_dir, anexos_dir=anexos_drive, recriar=True)
check("recriar importa de novo", rel2["pedidos"] == 2 and rel2["usuarios"] == 3)
from app.database import SessionLocal as S3  # noqa: E402
from app.models import Usuario as U3  # noqa: E402
d3 = S3()
check("ADMIN recriado pelo seed", d3.scalar(
    select(U3).where(U3.email == "admin@ms.senai.br")) is not None)
d3.close()

print()
if falhas:
    print("FALHAS:", falhas)
    sys.exit(1)
shutil.rmtree(TMP, ignore_errors=True)
print("IMPORT: TODOS OS TESTES PASSARAM ✔")
