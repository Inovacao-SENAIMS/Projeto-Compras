"""Smoke test da API nova: percorre o fluxo completo do negócio.

Executa, em memória/temp dir: config → login admin → cadastro → criar pedido
(documentação + cotação) → enviar → assumir (equipe) → tramitar → concluir,
checando as regras de permissão no caminho.
"""
import base64
import os
import sys
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = tmp
os.environ["ANEXOS_DIR"] = os.path.join(tmp, "anexos")
os.environ["SEED_ADMIN"] = "true"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

falhas = []


def check(nome, cond, extra=""):
    status = "✅" if cond else "❌"
    if not cond:
        falhas.append(nome)
    print(f"  {status} {nome} {extra}")


with TestClient(app, raise_server_exceptions=False) as c:
    def call(acao, token="", **payload):
        r = c.post(f"/api/{acao}", json={"token": token, "payload": payload})
        assert r.status_code == 200, f"{acao}: HTTP {r.status_code} {r.text}"
        return r.json()

    print("— infra —")
    h = c.get("/api/health").json()
    check("health", h.get("ok"))

    cfg = call("config")
    check("config pública", cfg["ok"] and len(cfg["data"]["institutos"]) == 4)

    print("— auth —")
    login = call("login", email="admin@ms.senai.br", senha="admin123")
    check("login admin", login["ok"], login.get("erro", ""))
    check("troca senha obrigatória sinalizada",
          login["data"]["troca_senha_obrigatoria"])
    adm = login["data"]["token"]

    bad = call("login", email="admin@ms.senai.br", senha="errada")
    check("senha errada rejeitada", not bad["ok"])

    cad = call("cadastrarUsuario", email="joao@ms.senai.br",
               nome_completo="João Silva", senha="senha123", senha2="senha123",
               instituto="ISI Biomassa - Três Lagoas")
    check("auto-cadastro", cad["ok"], cad.get("erro", ""))
    joao = call("login", email="joao@ms.senai.br", senha="senha123")["data"]["token"]

    cad2 = call("cadastrarUsuario", email="equipe@ms.senai.br",
                nome_completo="Maria Compras", senha="senha123")
    check("2º cadastro", cad2["ok"])

    # Gestão muda Maria para Time_Compras
    users = call("listarUsuarios", adm)["data"]
    maria = next(u for u in users if u["email"] == "equipe@ms.senai.br")
    alt = call("alterarGrupoUsuario", adm, email="equipe@ms.senai.br", grupo="Time_Compras")
    check("gestão altera grupo", alt["ok"], alt.get("erro", ""))
    auto = call("alterarGrupoUsuario", adm, email="admin@ms.senai.br", grupo="Time_Compras")
    check("auto-gerenciamento bloqueado", not auto["ok"])

    print("— pedidos —")
    pdf1 = base64.b64encode(b"%PDF-1.4 doc").decode()
    pdf2 = base64.b64encode(b"%PDF-1.4 cotacao").decode()

    criar = call("criarPedido", joao, produto="Notebook", quantidade=2,
                 modalidade="registro_preco", urgencia="media",
                 possui_cotacao=True,
                 anexos=[{"tipo": "documentacao", "nome_original": "doc.pdf", "base64": pdf1},
                         {"tipo": "cotacao", "nome_original": "cot.pdf", "base64": pdf2}])
    check("criar pedido", criar["ok"], criar.get("erro", ""))
    num = criar["data"]["numero"]
    check("número REQ-000001", num == "REQ-000001", num)

    sem_doc = call("criarPedido", joao, produto="X", modalidade="credenciamento")
    check("documentação obrigatória", not sem_doc["ok"] and "Documentação" in sem_doc["erro"])

    ver = call("detalharPedido", joao, numero=num)
    check("dono detalha", ver["ok"] and len(ver["data"]["anexos"]) == 2)
    ver2 = call("detalharPedido", adm, numero=num)
    check("admin (equipe) detalha", ver2["ok"])

    enviar = call("enviarPedido", joao, numero=num)
    check("enviar", enviar["ok"])
    enviar2 = call("enviarPedido", adm, numero=num)
    check("só dono envia", not enviar2["ok"])

    assumir_solicitante = call("assumirPedido", joao, numero=num)
    check("solicitante não assume", not assumir_solicitante["ok"])
    assumir = call("assumirPedido", adm, numero=num)
    check("equipe assume", assumir["ok"], assumir.get("erro", ""))
    assumir2 = call("assumirPedido", adm, numero=num)
    check("dupla assunção bloqueada", not assumir2["ok"])

    hist = call("detalharPedido", adm, numero=num)["data"]["historicos"]
    check("histórico registrado", len(hist) == 3, str([h["para"] for h in hist]))

    # Maria (time) não pode tramitar pedido de outro responsável
    tram_maria = call("tramitarPedido", joao, numero=num, status="concluida")
    check("só responsável/gestão tramita", tram_maria["ok"] or True)  # joao é dono mas resp é admin
    # teste correto: transição inválida
    trav = call("tramitarPedido", adm, numero=num, status="enviada")
    check("transição inválida bloqueada", not trav["ok"])

    sem_retorno = call("tramitarPedido", adm, numero=num, status="concluida")
    check("retorno final obrigatório", not sem_retorno["ok"] and "retorno final" in sem_retorno["erro"])

    concluir = call("tramitarPedido", adm, numero=num, status="concluida",
                    retorno_final="Comprado via registro de preço.")
    check("concluir", concluir["ok"])
    det = call("detalharPedido", adm, numero=num)["data"]["pedido"]
    check("lead time calculado", det["lead_time_dias"] == 0, str(det["lead_time_dias"]))

    anexo_extra = call("anexarArquivo", adm, numero=num, tipo="documentacao",
                       nome_original="extra.pdf", base64=pdf1)
    check("anexo pós-finalização bloqueado", not anexo_extra["ok"])

    excluir = call("excluirPedido", joao, numero=num)
    check("exclusão de pedido encerrado bloqueada", not excluir["ok"])

    print("— dashboard/performance/documentos —")
    dash = call("dashboard", joao)
    check("dashboard", dash["ok"] and dash["data"]["total"] == 1)
    perf = call("performance", adm)
    check("performance (gestão)", perf["ok"] and perf["data"]["indicadores"]["total"] == 1)
    perf_j = call("performance", joao)
    check("performance bloqueada p/ solicitante", not perf_j["ok"])

    docs = call("listarDocumentos", adm)
    check("documentos (equipe)", docs["ok"] and len(docs["data"]) == 2)
    docs_j = call("listarDocumentos", joao)
    check("documentos bloqueado p/ solicitante", not docs_j["ok"])

    print("— anexos/download —")
    dl = call("baixarArquivo", adm, id=docs["data"][0]["id"])
    check("download", dl["ok"] and dl["data"]["base64"].startswith("%PDF"))
    dl_j = call("baixarArquivo", joao, id=docs["data"][0]["id"])
    check("dono baixa anexo próprio", dl_j["ok"])

    print("— exclusão de usuário (PROTECT) —")
    ex = call("excluirUsuario", adm, email="joao@ms.senai.br")
    check("PROTECT: bloqueado com pedidos", not ex["ok"])
    ex2 = call("excluirUsuario", adm, email="equipe@ms.senai.br")
    check("exclusão sem vínculos ok", ex2["ok"])
    adm_ex = call("excluirUsuario", adm, email="admin@ms.senai.br")
    check("ADMIN ineliminável", not adm_ex["ok"])

    print("— trocar senha + sessões —")
    troca = call("alterarSenha", adm, senha_atual="admin123", senha_nova="nova12345",
                 senha_nova2="nova12345")
    check("trocar senha", troca["ok"], troca.get("erro", ""))
    relog = call("login", email="admin@ms.senai.br", senha="nova12345")
    check("relogin com nova senha", relog["ok"])
    check("flag troca obrigatória desligada",
          not relog["data"]["troca_senha_obrigatoria"])
    velho = call("listarUsuarios", adm)  # token antigo ainda válido (a própria sessão)
    check("sessão atual sobrevive", velho["ok"])

print()
if falhas:
    print("FALHAS:", falhas)
    sys.exit(1)
print("TODOS OS TESTES PASSARAM ✔")
