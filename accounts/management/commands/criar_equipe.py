"""Comando de gestão para criar/atualizar usuários de um perfil.

Uso típico (cria os 4 usuários iniciais da equipe de compras):

    python manage.py criar_equipe

Adicionar usuários extras sem alterar código:

    python manage.py criar_equipe --usuario joao:Senha@123:joao@ex.com

Criar solicitantes (qualquer grupo, inclusive vazio p/ papel padrao):

    python manage.py criar_equipe --grupo Solicitante --usuario ana:Senha@123
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from accounts.grupos import GROUP_EQUIPE
from accounts.perfis import criar_grupos


class Command(BaseCommand):
    help = (
        "Cria/atualiza usuários e os vincula a um grupo (padrão: Equipe de "
        "Compras). Sem argumentos, usa a lista EQUIPE_INICIAL de settings."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--usuario",
            action="append",
            default=[],
            metavar="USERNAME:SENHA[:EMAIL]",
            help="Usuário extra a criar/atualizar. Pode ser repetido.",
        )
        parser.add_argument(
            "--grupo",
            default=GROUP_EQUIPE,
            help="Grupo ao qual vincular os usuários (padrão: Equipe de Compras).",
        )
        parser.add_argument(
            "--reset-senha",
            action="store_true",
            help="Redefine a senha mesmo para usuários já existentes.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        criar_grupos()

        nome_grupo = options["grupo"]
        grupo = None
        if nome_grupo:
            grupo, _ = Group.objects.get_or_create(name=nome_grupo)

        usuarios = list(settings.EQUIPE_INICIAL) if not options["usuario"] else []
        for item in options["usuario"]:
            partes = item.split(":")
            if len(partes) < 2:
                self.stderr.write(
                    self.style.ERROR(f"Formato inválido (use USERNAME:SENHA[:EMAIL]): {item}")
                )
                continue
            username, senha = partes[0], partes[1]
            email = partes[2] if len(partes) > 2 else ""
            usuarios.append((username, email, senha))

        if not usuarios:
            self.stdout.write(self.style.WARNING("Nenhum usuário informado."))
            return

        for username, email, senha in usuarios:
            user, criado = User.objects.get_or_create(
                username=username, defaults={"email": email}
            )
            if email and user.email != email:
                user.email = email
            if criado or options["reset_senha"]:
                user.set_password(senha)
            user.save()

            if grupo is not None:
                user.groups.add(grupo)

            acao = "criado" if criado else "atualizado"
            destino = f" -> grupo '{nome_grupo}'" if grupo else ""
            self.stdout.write(self.style.SUCCESS(f"Usuário '{username}' {acao}{destino}."))
