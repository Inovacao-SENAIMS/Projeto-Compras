"""Renomeia os usuários seed para e-mails institucionais (@ms.senai.br).

Assim o login passa a ser feito pelo e-mail para todas as contas.
"""

from django.conf import settings
from django.db import migrations

RENOMEAR = {
    "admin": "admin@ms.senai.br",
    "gestor": "gestor@ms.senai.br",
    "ana": "ana@ms.senai.br",
    "compras1": "compras1@ms.senai.br",
    "compras2": "compras2@ms.senai.br",
    "compras3": "compras3@ms.senai.br",
    "compras4": "compras4@ms.senai.br",
}


def _renomear(User, origem, destino):
    usuario = User.objects.filter(username=origem).first()
    if usuario and not User.objects.filter(username=destino).exists():
        usuario.username = destino
        usuario.email = destino
        usuario.save()


def migrar(apps, schema_editor):
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    for origem, destino in RENOMEAR.items():
        _renomear(User, origem, destino)


def reverter(apps, schema_editor):
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    for origem, destino in RENOMEAR.items():
        usuario = User.objects.filter(username=destino).first()
        if usuario:
            usuario.username = origem
            usuario.save()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_initial")]

    operations = [migrations.RunPython(migrar, reverter)]
