from django.urls import path

from . import views

app_name = "pedidos"

urlpatterns = [
    # Área do solicitante
    path("meus-pedidos/", views.meus_pedidos, name="meus_pedidos"),
    path("meus-pedidos/novo/", views.pedido_criar, name="pedido_criar"),
    path("meus-pedidos/<int:pk>/", views.pedido_detalhe, name="pedido_detalhe"),
    # Área da equipe de compras
    path("compras/", views.equipe_lista, name="equipe_lista"),
    path("compras/<int:pk>/", views.equipe_detalhe, name="equipe_detalhe"),
    path("compras/<int:pk>/assumir/", views.equipe_assumir, name="equipe_assumir"),
    path("compras/<int:pk>/tramitar/", views.equipe_tramitar, name="equipe_tramitar"),
    # Download protegido de anexos
    path("anexos/<int:pk>/", views.anexo_download, name="anexo_download"),
]
