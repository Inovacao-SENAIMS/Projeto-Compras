from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("configuracoes/", views.configuracoes, name="configuracoes"),
]
