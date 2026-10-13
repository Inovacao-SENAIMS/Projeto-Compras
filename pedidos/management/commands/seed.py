"""Gera dados de exemplo para testar/visualizar o sistema.

Uso:
    python manage.py seed
    python manage.py seed --pedidos 120
    python manage.py seed --reset      # apaga as requisições antes de gerar
"""

import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from accounts.grupos import GROUP_MANAGER, GROUP_TIME, GROUP_USERISI
from accounts.models import Perfil
from accounts.perfis import criar_grupos, nome_exibicao
from pedidos.models import (
    Anexo,
    HistoricoStatus,
    Modalidade,
    Pedido,
    Status,
    TipoAnexo,
    Urgencia,
)

EQUIPE = [
    ("compras1@ms.senai.br", "Compras@2026", "Carlos", "Mendes"),
    ("compras2@ms.senai.br", "Compras@2026", "Fernanda", "Lima"),
    ("compras3@ms.senai.br", "Compras@2026", "Rafael", "Souza"),
    ("compras4@ms.senai.br", "Compras@2026", "Juliana", "Alves"),
]

GESTORES = [
    ("gestor@ms.senai.br", "Gestor@2026", "Marcos", "Andrade"),
]

SOLICITANTES = [
    ("ana@ms.senai.br", "Ana@2026", "Ana", "Beatriz", "Compras", "Analista",
     "ist_alimentos_dourados", "(67) 99100-0001", "1201"),
    ("joao@ms.senai.br", "Joao@2026", "João", "Pereira", "Manutenção", "Técnico",
     "isi_biomassa_tres_lagoas", "(67) 99100-0002", "1305"),
    ("marta@ms.senai.br", "Marta@2026", "Marta", "Rocha", "Administrativo", "Assistente",
     "ist_eficiencia_campo_grande", "(67) 99100-0003", "1410"),
    ("paulo@ms.senai.br", "Paulo@2026", "Paulo", "Nunes", "TI", "Analista de TI",
     "ist_alimentos_dourados", "(67) 99100-0004", "1502"),
    ("carla@ms.senai.br", "Carla@2026", "Carla", "Dias", "Qualidade", "Supervisora",
     "isi_biomassa_tres_lagoas", "(67) 99100-0005", "1601"),
    ("bruno@ms.senai.br", "Bruno@2026", "Bruno", "Teixeira", "Produção", "Encarregado",
     "ist_eficiencia_campo_grande", "(67) 99100-0006", "1703"),
]

PRODUTOS = [
    "Notebook Dell Latitude", "Monitor 27\"", "Cadeira giratória", "Mesa de escritório",
    "Impressora multifuncional", "Resma de papel A4", "Toner HP", "Ar-condicionado split",
    "Bebedouro industrial", "Kit de EPI", "Parafusadeira", "Multímetro digital",
    "Licença de software", "Suporte para monitor", "Armário de aço",
    "Lâmpada LED", "Extensão elétrica", "Caixa de ferramentas",
]

DESCRICOES = [
    "Equipamento novo para o setor.",
    "Reposição de item danificado.",
    "Material para o projeto em andamento.",
    "Item solicitado pela coordenação.",
    "Necessário para a operação diária.",
]

RETORNOS = [
    "Requisição atendida. Item adquirido e entregue ao solicitante.",
    "Compra concluída conforme solicitado.",
    "Item entregue e instalado.",
    "Processo finalizado com sucesso.",
]

PESOS_STATUS = [
    (Status.CONCLUIDA, 45),
    (Status.EM_ANALISE, 18),
    (Status.ENVIADA, 15),
    (Status.CANCELADA, 12),
    (Status.ABERTA, 10),
]


class Command(BaseCommand):
    help = "Gera dados de exemplo (usuários e requisições) para testar o sistema."

    def add_arguments(self, parser):
        parser.add_argument("--pedidos", type=int, default=80, help="Quantidade de requisições a gerar.")
        parser.add_argument("--reset", action="store_true", help="Apaga as requisições existentes antes de gerar.")

    def handle(self, *args, **options):
        random.seed(42)
        criar_grupos()

        if options["reset"]:
            removidos = Pedido.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Requisições anteriores removidas: {removidos[0]} objetos."))

        User = get_user_model()
        equipe = self._criar_usuarios(User, EQUIPE, GROUP_TIME)
        self._criar_usuarios(User, GESTORES, GROUP_MANAGER)
        solicitantes = self._criar_solicitantes(User, SOLICITANTES)

        criados = self._criar_pedidos(solicitantes, equipe, options["pedidos"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"OK! {criados} requisições geradas."))
        self._resumo()
        self._rotas()

    # ------------------------------------------------------------------
    def _criar_usuarios(self, User, dados, grupo_nome):
        grupo, _ = Group.objects.get_or_create(name=grupo_nome)
        usuarios = []
        for username, senha, primeiro, ultimo in dados:
            user, criado = User.objects.get_or_create(
                username=username, defaults={"email": username}
            )
            user.email = username
            user.first_name = primeiro
            user.last_name = ultimo
            if criado:
                user.set_password(senha)
            user.save()
            user.groups.add(grupo)
            usuarios.append(user)
        return usuarios

    def _criar_solicitantes(self, User, dados):
        grupo, _ = Group.objects.get_or_create(name=GROUP_USERISI)
        usuarios = []
        for username, senha, primeiro, ultimo, area, cargo, instituto, telefone, ramal in dados:
            user, criado = User.objects.get_or_create(
                username=username, defaults={"email": username}
            )
            user.email = username
            user.first_name = primeiro
            user.last_name = ultimo
            if criado:
                user.set_password(senha)
            user.save()
            user.groups.add(grupo)
            Perfil.objects.update_or_create(
                user=user,
                defaults={
                    "area_atuacao": area,
                    "cargo": cargo,
                    "instituto": instituto,
                    "telefone": telefone,
                    "ramal": ramal,
                },
            )
            usuarios.append(user)
        return usuarios

    def _criar_pedidos(self, solicitantes, equipe, quantidade):
        agora = timezone.now()
        modalidades = [m.value for m in Modalidade]
        urgencias = [u.value for u in Urgencia]
        status_opcoes = [s for s, _ in PESOS_STATUS]
        status_pesos = [p for _, p in PESOS_STATUS]

        criados = 0
        for _ in range(quantidade):
            solicitante = random.choice(solicitantes)
            status = random.choices(status_opcoes, weights=status_pesos, k=1)[0]
            criado_em = agora - timedelta(
                days=random.randint(0, 240),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )
            possui = random.random() < 0.4

            pedido = Pedido(
                produto=random.choice(PRODUTOS),
                descricao_objeto=random.choice(DESCRICOES),
                quantidade=random.randint(1, 20),
                criado_por=solicitante,
                solicitante_nome=nome_exibicao(solicitante),
                urgencia=random.choice(urgencias),
                modalidade=random.choice(modalidades),
                possui_cotacao=possui,
                status=status,
            )

            data_envio = None
            assumido_em = None
            concluido_em = None
            responsavel = None

            if status != Status.ABERTA:
                data_envio = criado_em + timedelta(hours=random.randint(1, 48))
            if status in (Status.EM_ANALISE, Status.CONCLUIDA, Status.CANCELADA):
                responsavel = random.choice(equipe)
                assumido_em = data_envio + timedelta(hours=random.randint(1, 72))
            if status in (Status.CONCLUIDA, Status.CANCELADA):
                concluido_em = min(
                    assumido_em + timedelta(days=random.randint(1, 20), hours=random.randint(0, 23)),
                    agora,
                )
            if status == Status.CONCLUIDA:
                pedido.retorno_final = random.choice(RETORNOS)

            pedido.responsavel = responsavel
            pedido.data_envio = data_envio
            pedido.assumido_em = assumido_em
            pedido.concluido_em = concluido_em
            pedido.save()

            # criado_em é auto_now_add -> ajusta para a data histórica
            Pedido.objects.filter(pk=pedido.pk).update(criado_em=criado_em)

            self._historico(pedido, solicitante, status, responsavel, criado_em, data_envio, assumido_em, concluido_em)
            self._anexos(pedido, solicitante, criado_em, possui)
            criados += 1

        return criados

    def _historico(self, pedido, solicitante, status, responsavel, criado_em, data_envio, assumido_em, concluido_em):
        entradas = [
            ("", Status.ABERTA, solicitante, criado_em, "Requisição criada pelo solicitante."),
        ]
        if status != Status.ABERTA:
            entradas.append((Status.ABERTA, Status.ENVIADA, solicitante, data_envio, "Requisição enviada pelo solicitante."))
        if responsavel is not None:
            entradas.append((
                Status.ENVIADA, Status.EM_ANALISE, responsavel, assumido_em,
                f"Requisição assumida por {nome_exibicao(responsavel)}.",
            ))
        if status == Status.CONCLUIDA:
            entradas.append((Status.EM_ANALISE, Status.CONCLUIDA, responsavel, concluido_em, "Requisição concluída."))
        elif status == Status.CANCELADA:
            entradas.append((Status.EM_ANALISE, Status.CANCELADA, responsavel, concluido_em, "Requisição cancelada."))

        for de, para, usuario, quando, observacao in entradas:
            registro = HistoricoStatus.objects.create(
                pedido=pedido, de=de, para=para, usuario=usuario, observacao=observacao
            )
            HistoricoStatus.objects.filter(pk=registro.pk).update(criado_em=quando)

    def _anexos(self, pedido, solicitante, criado_em, possui):
        documento = Anexo.objects.create(
            pedido=pedido,
            tipo=TipoAnexo.DOCUMENTACAO,
            arquivo=ContentFile(b"Documento de exemplo (seed).", name="documentacao.txt"),
            nome_original="documentacao.txt",
            enviado_por=solicitante,
        )
        Anexo.objects.filter(pk=documento.pk).update(enviado_em=criado_em)

        if possui:
            cotacao = Anexo.objects.create(
                pedido=pedido,
                tipo=TipoAnexo.COTACAO,
                arquivo=ContentFile(b"Cotacao de exemplo (seed).", name="cotacao.txt"),
                nome_original="cotacao.txt",
                enviado_por=solicitante,
            )
            Anexo.objects.filter(pk=cotacao.pk).update(enviado_em=criado_em)

    # ------------------------------------------------------------------
    def _resumo(self):
        contagem = {
            item["status"]: item["n"]
            for item in Pedido.objects.values("status").annotate(n=Count("id"))
        }
        self.stdout.write("Requisições por status:")
        for status in Status:
            self.stdout.write(f"   {status.label}: {contagem.get(status.value, 0)}")
        self.stdout.write(f"   TOTAL: {Pedido.objects.count()}")

    def _rotas(self):
        self.stdout.write("")
        self.stdout.write("Rotas para conferir (http://127.0.0.1:8000):")
        for nome, url in [
            ("Home / dashboard", "/"),
            ("Login", "/entrar/"),
            ("Cadastro", "/cadastro/"),
            ("Requisições (solicitante)", "/requisicoes/"),
            ("Requisições (equipe)", "/compras/"),
            ("Performance do time", "/compras/performance/"),
            ("Configurações", "/configuracoes/"),
            ("Admin", "/admin/"),
        ]:
            self.stdout.write(f"   {nome:28s} {url}")
        self.stdout.write("")
        self.stdout.write("Credenciais (login por e-mail):")
        for rotulo, usuario, senha in [
            ("SuperUsuário/ADM", "admin@ms.senai.br", "admin12345"),
            ("Gestor", "gestor@ms.senai.br", "Gestor@2026"),
            ("Time de Compras", "compras1@ms.senai.br", "Compras@2026"),
            ("Solicitante", "ana@ms.senai.br", "Ana@2026"),
        ]:
            self.stdout.write(f"   {rotulo:16s} {usuario:24s} {senha}")
