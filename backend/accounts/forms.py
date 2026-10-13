from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password

from .grupos import GROUP_USERISI
from .instituicoes import Instituto
from .models import Perfil


class CadastroForm(forms.Form):
    """Cadastro público de usuário (solicitante)."""

    nome_completo = forms.CharField(label="Nome completo", max_length=150)
    email = forms.EmailField(label="E-mail institucional", max_length=150)
    area_atuacao = forms.CharField(label="Área de atuação", max_length=120)
    cargo = forms.CharField(label="Cargo", max_length=120)
    instituto = forms.ChoiceField(
        label="Instituto",
        choices=[("", "Selecione o instituto")] + list(Instituto.choices),
    )
    telefone = forms.CharField(label="Contato (telefone)", max_length=20)
    ramal = forms.CharField(label="Ramal", max_length=10)
    password1 = forms.CharField(label="Senha", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Confirmar senha", widget=forms.PasswordInput)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for campo in self.fields.values():
            campo.widget.attrs.setdefault("class", "campo")

    def clean_email(self):
        email = (self.cleaned_data["email"] or "").strip().lower()
        if not email.endswith("@ms.senai.br"):
            raise forms.ValidationError(
                "Apenas e-mails institucionais com domínio @ms.senai.br são aceitos."
            )
        if get_user_model().objects.filter(username__iexact=email).exists():
            raise forms.ValidationError("Já existe um usuário cadastrado com este e-mail.")
        return email

    def clean(self):
        dados = super().clean()
        senha1 = dados.get("password1")
        senha2 = dados.get("password2")
        if senha1 and senha2 and senha1 != senha2:
            self.add_error("password2", "As senhas não conferem.")
        elif senha1:
            try:
                validate_password(senha1)
            except forms.ValidationError as erro:
                self.add_error("password1", erro)
        return dados

    def save(self):
        dados = self.cleaned_data
        nome = " ".join(dados["nome_completo"].split())
        primeiro, _, resto = nome.partition(" ")

        User = get_user_model()
        user = User.objects.create_user(
            username=dados["email"],
            email=dados["email"],
            password=dados["password1"],
            first_name=primeiro,
            last_name=resto,
        )
        grupo, _ = Group.objects.get_or_create(name=GROUP_USERISI)
        user.groups.add(grupo)

        Perfil.objects.create(
            user=user,
            area_atuacao=dados["area_atuacao"],
            cargo=dados["cargo"],
            instituto=dados["instituto"],
            telefone=dados["telefone"],
            ramal=dados["ramal"],
        )
        return user
