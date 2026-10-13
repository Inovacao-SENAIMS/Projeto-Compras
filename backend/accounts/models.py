from django.conf import settings
from django.db import models

from .instituicoes import Instituto


class Perfil(models.Model):
    """Dados complementares do usuário (preenchidos no cadastro)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="perfil",
        verbose_name="Usuário",
    )
    area_atuacao = models.CharField("Área de atuação", max_length=120)
    cargo = models.CharField("Cargo", max_length=120)
    instituto = models.CharField("Instituto", max_length=40, choices=Instituto.choices)
    telefone = models.CharField("Contato", max_length=20)
    ramal = models.CharField("Ramal", max_length=10)
    criado_em = models.DateTimeField("Criado em", auto_now_add=True)

    class Meta:
        verbose_name = "perfil"
        verbose_name_plural = "perfis"

    def __str__(self):
        return f"Perfil de {self.user.get_username()}"
