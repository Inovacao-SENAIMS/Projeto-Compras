import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


class Urgencia(models.TextChoices):
    BAIXA = "baixa", "Baixa"
    MEDIA = "media", "Média"
    ALTA = "alta", "Alta"
    CRITICA = "critica", "Crítica"


class Status(models.TextChoices):
    NOVO = "novo", "Novo"
    EM_COTACAO = "em_cotacao", "Em cotação"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao", "Aguardando aprovação"
    APROVADO = "aprovado", "Aprovado"
    CONCLUIDO = "concluido", "Concluído"
    CANCELADO = "cancelado", "Cancelado"


# Transições permitidas a partir de cada status.
# `NOVO -> EM_COTACAO` não aparece aqui: só acontece via ação "Assumir".
TRANSICOES = {
    Status.NOVO: [],
    Status.EM_COTACAO: [
        Status.AGUARDANDO_APROVACAO,
        Status.APROVADO,
        Status.CANCELADO,
    ],
    Status.AGUARDANDO_APROVACAO: [Status.APROVADO, Status.CANCELADO],
    Status.APROVADO: [Status.CONCLUIDO, Status.CANCELADO],
    Status.CONCLUIDO: [],
    Status.CANCELADO: [],
}

STATUS_TERMINAIS = {Status.CONCLUIDO, Status.CANCELADO}


def caminho_anexo(instance, filename):
    """Gera um caminho seguro/único para o arquivo enviado.

    O nome original não é usado no disco (evita path traversal e colisões);
    ele é preservado no campo `nome_original`.
    """
    extensao = Path(filename).suffix.lower()
    return f"anexos/{instance.pedido_id}/{uuid.uuid4().hex}{extensao}"


class Pedido(models.Model):
    produto = models.CharField("Produto", max_length=255)
    solicitante_nome = models.CharField("Nome do solicitante", max_length=150)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pedidos_criados",
        verbose_name="Criado por",
    )
    urgencia = models.CharField(
        "Urgência", max_length=10, choices=Urgencia.choices, default=Urgencia.BAIXA
    )
    status = models.CharField(
        "Status", max_length=30, choices=Status.choices, default=Status.NOVO
    )
    responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="pedidos_assumidos",
        verbose_name="Responsável",
    )
    retorno_final = models.TextField("Retorno final", blank=True)

    criado_em = models.DateTimeField("Criado em", auto_now_add=True)
    atualizado_em = models.DateTimeField("Atualizado em", auto_now=True)
    assumido_em = models.DateTimeField("Assumido em", null=True, blank=True)
    concluido_em = models.DateTimeField("Concluído em", null=True, blank=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "pedido"
        verbose_name_plural = "pedidos"

    def __str__(self):
        return f"Pedido #{self.pk} - {self.produto}"

    @property
    def assumido(self):
        return self.responsavel_id is not None

    @property
    def finalizado(self):
        return self.status in STATUS_TERMINAIS

    @property
    def transicoes_permitidas(self):
        return TRANSICOES.get(self.status, [])

    def pode_transitar_para(self, novo_status):
        return novo_status in self.transicoes_permitidas

    def status_label(self):
        return self.get_status_display()


class Anexo(models.Model):
    pedido = models.ForeignKey(
        Pedido, on_delete=models.CASCADE, related_name="anexos", verbose_name="Pedido"
    )
    arquivo = models.FileField("Arquivo", upload_to=caminho_anexo)
    nome_original = models.CharField("Nome original", max_length=255)
    enviado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="anexos_enviados",
        verbose_name="Enviado por",
    )
    enviado_em = models.DateTimeField("Enviado em", auto_now_add=True)

    class Meta:
        ordering = ["-enviado_em"]
        verbose_name = "anexo"
        verbose_name_plural = "anexos"

    def __str__(self):
        return self.nome_original


class HistoricoStatus(models.Model):
    pedido = models.ForeignKey(
        Pedido, on_delete=models.CASCADE, related_name="historicos", verbose_name="Pedido"
    )
    de = models.CharField("De", max_length=30, choices=Status.choices, blank=True)
    para = models.CharField("Para", max_length=30, choices=Status.choices)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="historicos_status",
        verbose_name="Usuário",
    )
    observacao = models.TextField("Observação", blank=True)
    criado_em = models.DateTimeField("Criado em", auto_now_add=True)

    class Meta:
        ordering = ["criado_em"]
        verbose_name = "histórico de status"
        verbose_name_plural = "históricos de status"

    def __str__(self):
        return f"{self.pedido_id}: {self.de or '-'} -> {self.para}"
