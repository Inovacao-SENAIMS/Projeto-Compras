import uuid
from pathlib import Path

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.dispatch import receiver
from django.utils import timezone


class Urgencia(models.TextChoices):
    BAIXA = "baixa", "Baixa"
    MEDIA = "media", "Média"
    ALTA = "alta", "Alta"
    CRITICA = "critica", "Crítica"


class Modalidade(models.TextChoices):
    """Modalidades conforme o Regulamento RCA (SENAI)."""

    SELECAO_COM_DISPUTA_ABERTA = (
        "selecao_com_disputa_aberta",
        "Seleção com Disputa (Aberta)",
    )
    SELECAO_COM_DISPUTA_FECHADA = (
        "selecao_com_disputa_fechada",
        "Seleção com Disputa (Fechada)",
    )
    SELECAO_SEM_DISPUTA_DISPENSA = (
        "selecao_sem_disputa_dispensa",
        "Seleção sem Disputa (Dispensa)",
    )
    SELECAO_SEM_DISPUTA_INEXIGIBILIDADE = (
        "selecao_sem_disputa_inexigibilidade",
        "Seleção sem Disputa (Inexigibilidade)",
    )
    CREDENCIAMENTO = "credenciamento", "Credenciamento"
    PRE_QUALIFICACAO = "pre_qualificacao", "Pré-qualificação"
    DIALOGO_PREVIO = "dialogo_previo", "Diálogo Prévio"
    REGISTRO_PRECO = "registro_preco", "Registro de Preço"


class Status(models.TextChoices):
    ABERTA = "aberta", "Aberta"
    ENVIADA = "enviada", "Enviada"
    EM_ANALISE = "em_analise", "Em Análise"
    CONCLUIDA = "concluida", "Concluída"
    CANCELADA = "cancelada", "Cancelada"


# Transições de status disponíveis na tela "Tramitar" (equipe).
# `aberta -> enviada` é a ação "Enviar" (solicitante) e
# `enviada -> em_analise` é a ação "Assumir"/"Designar" (equipe): ambas têm
# tratamento próprio e por isso não aparecem no formulário de tramitação.
TRANSICOES = {
    Status.ABERTA: [],
    Status.ENVIADA: [],
    Status.EM_ANALISE: [Status.CONCLUIDA, Status.CANCELADA],
    Status.CONCLUIDA: [],
    Status.CANCELADA: [],
}

STATUS_TERMINAIS = {Status.CONCLUIDA, Status.CANCELADA}


def caminho_anexo(instance, filename):
    """Gera um caminho seguro/único para o arquivo enviado.

    O nome original não é usado no disco (evita path traversal e colisões);
    ele é preservado no campo `nome_original`.
    """
    extensao = Path(filename).suffix.lower()
    return f"anexos/{instance.pedido_id}/{uuid.uuid4().hex}{extensao}"


class Pedido(models.Model):
    numero = models.CharField(
        "Nº da Requisição",
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        editable=False,
    )
    produto = models.CharField("Produto", max_length=255)
    descricao_objeto = models.TextField("Descrição do Objeto", blank=True)
    quantidade = models.PositiveIntegerField(
        "Quantidade", default=1, validators=[MinValueValidator(1)]
    )
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
    possui_cotacao = models.BooleanField("Possui cotação", default=False)
    modalidade = models.CharField(
        "Modalidade (RCA)",
        max_length=50,
        choices=Modalidade.choices,
        blank=True,
    )
    data_envio = models.DateTimeField("Data de envio", null=True, blank=True)
    status = models.CharField(
        "Status", max_length=30, choices=Status.choices, default=Status.ABERTA
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
        return f"{self.numero or ('Pedido #%s' % self.pk)} - {self.produto}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.numero:
            self.numero = f"REQ-{self.pk:06d}"
            type(self).objects.filter(pk=self.pk).update(numero=self.numero)

    @property
    def responsavel_nome(self):
        """Primeiro nome do responsável (exibição compacta na tabela)."""
        if not self.responsavel_id:
            return ""
        nome = self.responsavel.get_full_name() or self.responsavel.get_username()
        return nome.split()[0] if nome else ""

    @property
    def lead_time_dias(self):
        """Dias entre o envio e o encerramento (ou a data atual, se aberto).

        Regra (spec 3.3):
        - sem data de envio -> vazio (None);
        - com envio e encerramento -> encerramento - envio;
        - com envio, sem encerramento -> hoje - envio.
        """
        if not self.data_envio:
            return None
        fim = (
            timezone.localtime(self.concluido_em).date()
            if self.concluido_em
            else timezone.localdate()
        )
        return (fim - timezone.localtime(self.data_envio).date()).days

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


class TipoAnexo(models.TextChoices):
    DOCUMENTACAO = "documentacao", "Documentação"
    COTACAO = "cotacao", "Cotação"


class Anexo(models.Model):
    pedido = models.ForeignKey(
        Pedido, on_delete=models.CASCADE, related_name="anexos", verbose_name="Pedido"
    )
    tipo = models.CharField(
        "Tipo", max_length=15, choices=TipoAnexo.choices, default=TipoAnexo.DOCUMENTACAO
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


@receiver(models.signals.post_delete, sender=Anexo)
def apagar_arquivo_do_anexo(sender, instance, **kwargs):
    """Remove o arquivo do disco quando o Anexo é excluído."""
    if instance.arquivo:
        instance.arquivo.delete(save=False)
