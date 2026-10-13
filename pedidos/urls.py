from django.urls import path

from . import views

app_name = "pedidos"

urlpatterns = [
    # Área do solicitante — Painel de Requisições
    path("requisicoes/", views.painel, name="painel"),
    path("requisicoes/<int:pk>/", views.pedido_detalhe, name="pedido_detalhe"),
    path("requisicoes/<int:pk>/enviar/", views.pedido_enviar, name="pedido_enviar"),
    path("requisicoes/<int:pk>/excluir/", views.pedido_excluir, name="pedido_excluir"),
    # Área da equipe de compras
    path("compras/", views.equipe_lista, name="equipe_lista"),
    path("compras/<int:pk>/", views.equipe_detalhe, name="equipe_detalhe"),
    path("compras/<int:pk>/assumir/", views.equipe_assumir, name="equipe_assumir"),
    path("compras/<int:pk>/designar/", views.equipe_designar, name="equipe_designar"),
    path("compras/<int:pk>/tramitar/", views.equipe_tramitar, name="equipe_tramitar"),
    # Download protegido de anexos
    path("anexos/<int:pk>/", views.anexo_download, name="anexo_download"),
]
