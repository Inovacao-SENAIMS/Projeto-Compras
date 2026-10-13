"""Instituições (unidades) do SENAI MS."""

from django.db import models


class Instituto(models.TextChoices):
    IST_ALIMENTOS = "ist_alimentos_dourados", "IST Alimentos e Bebidas - Dourados"
    ISI_BIOMASSA = "isi_biomassa_tres_lagoas", "ISI Biomassa - Três Lagoas"
    IST_EFICIENCIA = (
        "ist_eficiencia_campo_grande",
        "IST Eficiência Operacional - Campo Grande",
    )
