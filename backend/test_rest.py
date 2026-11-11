"""Teste da superfície REST (Task 3 + degola do legado): Bearer token,
status codes e fluxo completo. Os "actions" do Apps Script não existem mais.
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
    ok = "✅" if cond else "❌"
    if not cond:
        falhas.append(nome)
    print(f"  {ok} {nome} {extra}")


with TestClient(app, raise_server_exceptions=False) as c:
    B = "/api"

    print("— auth REST —")
    r = c.get(f"{B}/me")
    check("401 sem token", r.status_code == 401, str(r.status_code))
    check("detalhe da mensagem", "Sessão expirada" in r.json()["detail"])

    r = c.post(f"{B}/auth/login", json={"email": "admin@ms.senai.br", "senha": "errada"})
    check("400 credenciais inválidas", r.status_code == 400)

    r = c.post(f"{B}/auth/login", json={"email": "admin@ms.senai.br", "senha": "admin123"})
    check("200 login", r.status_code == 200 and r.json()["token"], "")
    check("envelope legado não vem no REST", "ok" not in r.json())
    adm = r.json()["token"]
    HA = {"Authorization": f"Bearer {adm}"}

    r = c.get(f"{B}/me", headers=HA)
    check("GET /me com Bearer", r.status_code == 200
          and r.json()["email"] == "admin@ms.senai.br")

    r = c.post(f"{B}/auth/cadastro", json={
        "email": "bia@ms.senai.br", "nome_completo": "Bia Teste",
        "senha": "senha123", "senha2": "senha123",
        "instituto": "ISI Biomassa - Três Lagoas"})
    check("201 cadastro", r.status_code == 201)
    login_bia = c.post(f"{B}/auth/login",
                       json={"email": "bia@ms.senai.br", "senha": "senha123"}).json()
    bia = login_bia["token"]
    HB = {"Authorization": f"Bearer {bia}"}

    r = c.get(f"{B}/me", headers={"Authorization": "Bearer token-invalido"})
    check("401 token inválido", r.status_code == 401)

    print("— usuários REST —")
    r = c.get(f"{B}/usuarios", headers=HB)
    check("403-equivalente: solicitante não lista (400)", r.status_code == 400)
    r = c.get(f"{B}/usuarios", headers=HA)
    check("gestão lista", r.status_code == 200
          and any(u["email"] == "bia@ms.senai.br" for u in r.json()))

    r = c.post(f"{B}/usuarios", headers=HA, json={
        "email": "time1@ms.senai.br", "nome_completo": "Time Um",
        "senha": "senha123", "grupo": "Time_Compras"})
    check("201 criar usuário (gestão)", r.status_code == 201)

    r = c.patch(f"{B}/usuarios/bia@ms.senai.br", headers=HA, json={"grupo": "Time_Compras"})
    check("PATCH grupo", r.status_code == 200)
    r = c.patch(f"{B}/usuarios/bia@ms.senai.br", headers=HA, json={})
    check("PATCH vazio → 400", r.status_code == 400)

    r = c.get(f"{B}/responsaveis", headers=HA)
    check("responsáveis inclui bia", any(x["email"] == "bia@ms.senai.br" for x in r.json()))

    print("— pedidos REST —")
    pdf = base64.b64encode(b"%PDF-1.4 doc").decode()
    r = c.post(f"{B}/pedidos", headers=HB, json={
        "produto": "Monitor", "quantidade": 3, "modalidade": "credenciamento",
        "urgencia": "media", "possui_cotacao": False,
        "anexos": [{"tipo": "documentacao", "nome_original": "doc.pdf", "base64": pdf}]})
    check("201 criar pedido", r.status_code == 201, r.json().get("detail", ""))
    num = r.json()["numero"]
    check("número correto", num == "REQ-000001", num)

    r = c.get(f"{B}/pedidos", headers=HB)
    check("GET /pedidos (dono vê 1)", r.status_code == 200 and len(r.json()) == 1)
    r = c.get(f"{B}/pedidos?status=aberta", headers=HA)
    check("GET com filtro de status", len(r.json()) == 1)

    r = c.get(f"{B}/pedidos/{num}", headers=HB)
    check("GET detalhe", r.status_code == 200 and r.json()["pedido"]["numero"] == num)
    r = c.get(f"{B}/pedidos/REQ-999999", headers=HB)
    check("400 não encontrada (regra)", r.status_code == 400
          and "não encontrada" in r.json()["detail"])

    r = c.post(f"{B}/pedidos/{num}/enviar", headers=HB)
    check("POST enviar", r.status_code == 200 and r.json()["status"] == "enviada")
    r = c.post(f"{B}/pedidos/{num}/enviar", headers=HB)
    check("reenvio bloqueado", r.status_code == 400)

    r = c.post(f"{B}/pedidos/{num}/assumir", headers=HB)
    check("POST assumir (agora é time)", r.status_code == 200
          and r.json()["status"] == "em_analise")
    r = c.post(f"{B}/pedidos/{num}/assumir", headers=HA)
    check("dupla assunção → 400", r.status_code == 400
          and "outro membro" in r.json()["detail"])

    r = c.post(f"{B}/pedidos/{num}/tramitar", headers=HB,
               json={"status": "concluida"})
    check("retorno final obrigatório → 400", r.status_code == 400)
    r = c.post(f"{B}/pedidos/{num}/tramitar", headers=HB,
               json={"status": "concluida", "retorno_final": "Comprado.", "observacao": "ok"})
    check("tramitar conclui", r.status_code == 200)

    r = c.get(f"{B}/pedidos/{num}", headers=HA)
    hist = r.json()["historicos"]
    check("histórico consistente", [h["para"] for h in hist]
          == ["aberta", "enviada", "em_analise", "concluida"],
          str([h["para"] for h in hist]))

    print("— anexos REST —")
    r = c.get(f"{B}/pedidos/{num}/anexos", headers=HB)
    check("GET anexos", len(r.json()) == 1)
    r = c.post(f"{B}/pedidos/{num}/anexos", headers=HB,
               json={"tipo": "documentacao", "nome_original": "extra.pdf", "base64": pdf})
    check("anexo pós-finalização → 400", r.status_code == 400)

    r = c.get(f"{B}/anexos/ANX-000001/arquivo", headers=HB)
    check("download binário 200", r.status_code == 200)
    check("conteúdo correto", r.content == b"%PDF-1.4 doc")
    check("Content-Disposition nome", "doc.pdf" in r.headers.get("Content-Disposition", ""))
    cd = r.headers.get("Content-Disposition", "")
    check("filename* UTF-8 presente", "filename*=UTF-8''" in cd)

    r = c.get(f"{B}/documentos", headers=HB)
    check("GET documentos (equipe)", r.status_code == 200 and len(r.json()) == 1)

    print("— agregações REST —")
    r = c.get(f"{B}/dashboard", headers=HB)
    check("GET dashboard", r.status_code == 200 and r.json()["total"] == 1)
    r = c.get(f"{B}/performance", headers=HA)
    check("GET performance", r.status_code == 200
          and r.json()["indicadores"]["total"] == 1)
    r = c.get(f"{B}/performance", headers=HB)
    check("performance → 400 p/ não-gestão", r.status_code == 400)
    r = c.get(f"{B}/config")
    check("GET config público", r.status_code == 200 and "institutos" in r.json())

    print("— actions legados removidos (Task: degola) —")
    r = c.post(f"{B}/listarPedidos", json={"token": bia, "payload": {}})
    check("POST /api/{acao} não existe mais (404/405)", r.status_code in (404, 405))

    print("— exclusão REST —")
    r = c.delete(f"{B}/usuarios/bia@ms.senai.br", headers=HA)
    check("DELETE usuário com pedido → 400 PROTECT", r.status_code == 400
          and "requisições vinculadas" in r.json()["detail"])

    print("— regras preservadas (ex-smoke) —")
    # flag de senha padrão do ADMIN
    r = c.post(f"{B}/auth/login", json={"email": "admin@ms.senai.br", "senha": "admin123"})
    check("flag troca senha obrigatória", r.json()["troca_senha_obrigatoria"] is True)

    # auto-gerenciamento bloqueado
    r = c.patch(f"{B}/usuarios/admin@ms.senai.br", headers=HA, json={"grupo": "Time_Compras"})
    check("auto-gerenciamento bloqueado", r.status_code == 400)
    r = c.patch(f"{B}/usuarios/admin@ms.senai.br", headers=HA, json={"ativo": False})
    check("ADMIN não pode ser inativado", r.status_code == 400)
    r = c.delete(f"{B}/usuarios/admin@ms.senai.br", headers=HA)
    check("ADMIN ineliminável", r.status_code == 400)

    # exclusão de usuário sem vínculos funciona
    r = c.post(f"{B}/usuarios", headers=HA, json={
        "email": "temp@ms.senai.br", "nome_completo": "Temp", "senha": "senha123"})
    check("criar usuário temporário", r.status_code == 201)
    r = c.delete(f"{B}/usuarios/temp@ms.senai.br", headers=HA)
    check("DELETE usuário sem vínculos ok", r.status_code == 200)

    # solicitante puro: não assume e não vê documentos da equipe
    r = c.post(f"{B}/usuarios", headers=HA, json={
        "email": "solic@ms.senai.br", "nome_completo": "Solic", "senha": "senha123",
        "grupo": "UserISI_IST"})
    check("criar solicitante", r.status_code == 201)
    sol = c.post(f"{B}/auth/login",
                 json={"email": "solic@ms.senai.br", "senha": "senha123"}).json()["token"]
    HS = {"Authorization": f"Bearer {sol}"}
    r = c.post(f"{B}/pedidos/REQ-000001/assumir", headers=HS)
    check("solicitante não assume", r.status_code == 400)
    r = c.get(f"{B}/documentos", headers=HS)
    check("documentos bloqueado p/ solicitante", r.status_code == 400)

    # troca de senha + sessões
    r = c.post(f"{B}/auth/senha", headers=HA, json={
        "senha_atual": "admin123", "senha_nova": "nova12345", "senha_nova2": "nova12345"})
    check("trocar senha via REST", r.status_code == 200, r.json().get("detail", ""))
    r = c.get(f"{B}/me", headers=HA)
    check("sessão atual sobrevive à troca", r.status_code == 200)
    r = c.post(f"{B}/auth/login", json={"email": "admin@ms.senai.br", "senha": "nova12345"})
    check("relogin com nova senha", r.status_code == 200)
    check("flag troca obrigatória desligada",
          r.json()["troca_senha_obrigatoria"] is False)
    r = c.post(f"{B}/auth/senha", headers=HA, json={
        "senha_atual": "nova12345", "senha_nova": "admin123", "senha_nova2": "admin123"})
    check("volta senha admin123 (p/ próximos testes)", r.status_code == 200)

    # logout invalida o token
    r = c.post(f"{B}/auth/logout", headers=HB)
    check("logout ok", r.status_code == 200)
    r = c.get(f"{B}/me", headers=HB)
    check("token invalidado após logout", r.status_code == 401)

    # reset de senha: solicitar → redefinir → login
    r = c.post(f"{B}/auth/reset/solicitar", json={
        "email": "solic@ms.senai.br", "base_url": "https://localhost"})
    check("reset solicitado (resposta padrão)", r.status_code == 200)
    from app.models import ResetSenha
    from app.database import SessionLocal as SL
    dbr = SL()
    tok = dbr.query(ResetSenha).filter(ResetSenha.email == "solic@ms.senai.br").first().token
    dbr.close()
    check("token gravado no banco", bool(tok))
    r = c.post(f"{B}/auth/reset/redefinir", json={
        "token": tok, "senha": "novadesenha", "senha2": "novadesenha"})
    check("redefinir senha", r.status_code == 200)
    r = c.post(f"{B}/auth/reset/redefinir", json={
        "token": tok, "senha": "outrasenha", "senha2": "outrasenha"})
    check("reuso do token bloqueado", r.status_code == 400 and "utilizado" in r.json()["detail"])
    r = c.post(f"{B}/auth/login", json={"email": "solic@ms.senai.br", "senha": "novadesenha"})
    check("login com senha redefinida", r.status_code == 200)

print()
if falhas:
    print("FALHAS:", falhas)
    sys.exit(1)
print("REST: TODOS OS TESTES PASSARAM ✔")
