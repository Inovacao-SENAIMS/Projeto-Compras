from django.shortcuts import render


def home(request):
    """Página inicial do projeto."""
    return render(request, "home.html")
