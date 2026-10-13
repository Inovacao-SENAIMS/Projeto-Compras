from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("cadastro/", views.cadastro, name="cadastro"),
    path("configuracoes/", views.configuracoes, name="configuracoes"),
]
