from django.contrib import admin

from .models import Anexo, HistoricoStatus, Pedido


class AnexoInline(admin.TabularInline):
    model = Anexo
    extra = 0
    fields = ("nome_original", "arquivo", "enviado_por", "enviado_em")
    readonly_fields = ("nome_original", "enviado_por", "enviado_em")


@admin.register(Pedido)
class PedidoAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "produto",
        "solicitante_nome",
        "urgencia",
        "status",
        "responsavel",
        "criado_em",
    )
    list_filter = ("status", "urgencia")
    search_fields = ("produto", "solicitante_nome")
    readonly_fields = ("criado_em", "atualizado_em", "assumido_em", "concluido_em")
    inlines = [AnexoInline]


@admin.register(HistoricoStatus)
class HistoricoStatusAdmin(admin.ModelAdmin):
    list_display = ("pedido", "de", "para", "usuario", "criado_em")
    list_filter = ("para",)
