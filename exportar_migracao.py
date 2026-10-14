# -*- coding: utf-8 -*-
"""Exporta os dados do Django (db.sqlite3) para CSVs no formato das abas da
planilha "Compras_DB", mantendo usernames como e-mails e datas em ISO.

Uso:
    python backend/manage.py shell < exportar_migracao.py
ou:
    python exportar_migracao.py  (com DJANGO_SETTINGS_MODULE ajustado ou dentro de shell)

Saída: pasta migracao/ com Usuarios.csv, Pedidos.csv, HistoricoStatus.csv,
AnexosAudit.csv (os anexos em si são enviados depois pelo Apps Script).
"""
import csv
import os
import sys
from pathlib import Path

import django

# Se rodado fora do manage.py shell:
if "DJANGO_SETTINGS_MODULE" not in os.environ:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "compras.settings")
    BASE = Path(__file__).resolve().parent
    if str(BASE / "backend") not in sys.path:
        sys.path.insert(0, str(BASE / "backend"))
    django.setup()

from django.utils import timezone  # noqa: E402

from pedidos.models import Anexo, HistoricoStatus, Pedido  # noqa: E402

try:
    from django.contrib.auth import get_user_model
except Exception:  # pragma: no cover
    raise SystemExit("Importe este arquivo via: python backend/manage.py shell < exportar_migracao.py")

SAIDA = Path(__file__).resolve().parent / "migracao"

ROTULO_INSTITUTO = {
    "ist_alimentos_dourados": "IST Alimentos e Bebidas - Dourados",
    "isi_biomassa_tres_lagoas": "ISI Biomassa - Três Lagoas",
    "ist_eficiencia_campo_grande": "IST Eficiência Operacional - Campo Grande",
}


def iso(dt):
    if not dt:
        return ""
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def grupo_de(user):
    if user.is_superuser:
        return "SuperUsuario"

    nomes = {g.name for g in user.groups.all()}
    if not nomes and hasattr(user, "perfil") and getattr(user, "perfil", None):
        nomes.add(str(getattr(getattr(user, "perfil"), "grupo", "") or user.perfil))

    # grupos legados (migrados por accounts.0001_migrar_grupos)
    if "Equipe de Compras" in nomes:
        nomes.add("Time_Compras")
    if "Solicitante" in nomes:
        nomes.add("UserISI_IST")

    if "Manager_Compras" in nomes:
        return "Manager_Compras"
    if "Time_Compras" in nomes:
        return "Time_Compras"
    return "UserISI_IST"


def main():
    Usuario = get_user_model()
    SAIDA.mkdir(exist_ok=True)

    # ---------------------------------------------------------- usuarios
    with open(SAIDA / "Usuarios.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["nome_completo", "email", "grupo", "area_atuacao", "cargo",
                    "instituto", "telefone", "ramal", "ativo"])
        for u in Usuario.objects.all():
            perfil = getattr(u, "perfil", None)
            inst = getattr(perfil, "instituto", "") or ""
            w.writerow([
                u.get_full_name() or u.username,
                u.username if "@" in u.username else (f"{u.username}@ms.senai.br"),
                grupo_de(u),
                getattr(perfil, "area_atuacao", "") or "",
                getattr(perfil, "cargo", "") or "",
                ROTULO_INSTITUTO.get(inst, inst),
                getattr(perfil, "telefone", "") or "",
                getattr(perfil, "ramal", "") or "",
                "true" if u.is_active else "false",
            ])

    # ---------------------------------------------------------- pedidos
    with open(SAIDA / "Pedidos.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["numero", "produto", "descricao_objeto", "quantidade",
                    "modalidade", "urgencia", "possui_cotacao",
                    "solicitante_nome", "criado_por", "data_envio", "status",
                    "responsavel", "retorno_final", "criado_em",
                    "atualizado_em", "assumido_em", "concluido_em"])
        for p in Pedido.objects.all():
            w.writerow([
                p.numero or "",
                p.produto,
                p.descricao_objeto,
                p.quantidade,
                p.modalidade or "",
                p.urgencia,
                "true" if p.possui_cotacao else "false",
                p.solicitante_nome,
                p.criado_por.username,
                iso(p.data_envio),
                p.status,
                p.responsavel.username if p.responsavel else "",
                p.retorno_final,
                iso(p.criado_em),
                iso(p.atualizado_em),
                iso(p.assumido_em),
                iso(p.concluido_em),
            ])
        print(f"== Verificação: {Pedido.objects.count()} pedidos exportados ==")

    # ---------------------------------------------------------- historico
    with open(SAIDA / "HistoricoStatus.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["numero_req", "de", "para", "usuario", "observacao", "criado_em"])
        for h in HistoricoStatus.objects.select_related("pedido", "usuario").all():
            w.writerow([
                h.pedido.numero or f"Pedido #{h.pedido.pk}",
                h.de or "",
                h.para,
                h.usuario.username,
                h.observacao,
                iso(h.criado_em),
            ])

    # ------------------------------------------------- anexos (audit p/ Apps Script)
    with open(SAIDA / "AnexosAudit.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["id_arquivo", "numero_req", "tipo", "nome_original",
                    "caminho_local", "enviado_por", "enviado_em"])
        for a in Anexo.objects.select_related("pedido", "enviado_por").all():
            w.writerow([
                str(a.pk),
                a.pedido.numero or f"Pedido #{a.pedido.pk}",
                getattr(a, "tipo", "documentacao"),
                a.nome_original,
                str(a.arquivo.path) if a.arquivo and a.arquivo.storage.exists(a.arquivo.name) else "",
                a.enviado_por.username,
                iso(a.enviado_em),
            ])

    print(f"== Verificação: {Usuario.objects.count()} usuários exportados ==")
    print(f"== Verificação: {Anexo.objects.count()} anexos catalogados ==")
    print(f"== CSVs escritos em: {SAIDA} ==")


if __name__ == "__main__":
    main()
