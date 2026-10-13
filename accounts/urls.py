from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("cadastro/", views.cadastro, name="cadastro"),
    path("configuracoes/", views.configuracoes, name="configuracoes"),
    path("usuarios/<int:pk>/ativar/", views.usuario_ativar, name="usuario_ativar"),
    path("usuarios/<int:pk>/inativar/", views.usuario_inativar, name="usuario_inativar"),
    path("usuarios/<int:pk>/excluir/", views.usuario_excluir, name="usuario_excluir"),
]
