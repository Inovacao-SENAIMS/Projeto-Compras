"""Migra os grupos antigos para os novos perfis e garante os grupos existentes.

- "Equipe de Compras" -> "Time_Compras"
- "Solicitante"       -> "UserISI_IST"
- cria "Manager_Compras"
"""

from django.conf import settings
from django.db import migrations


def _mover_usuarios(User, Group, antigo, novo):
    origem = Group.objects.filter(name=antigo).first()
    if not origem:
        return
    destino, _ = Group.objects.get_or_create(name=novo)
    for usuario in User.objects.filter(groups=origem):
        usuario.groups.add(destino)
    origem.delete()


def migrar(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))

    _mover_usuarios(User, Group, "Equipe de Compras", "Time_Compras")
    _mover_usuarios(User, Group, "Solicitante", "UserISI_IST")

    for nome in ("UserISI_IST", "Time_Compras", "Manager_Compras"):
        Group.objects.get_or_create(name=nome)


def reverter(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))

    _mover_usuarios(User, Group, "Time_Compras", "Equipe de Compras")
    _mover_usuarios(User, Group, "UserISI_IST", "Solicitante")


class Migration(migrations.Migration):
    dependencies = [("auth", "0001_initial")]

    operations = [migrations.RunPython(migrar, reverter)]
