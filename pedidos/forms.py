from django import forms

from .models import Modalidade, Pedido, Status
from .validators import validar_arquivo


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleFileField(forms.FileField):
    """Campo de arquivo que aceita múltiplos arquivos e valida cada um."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleFileInput())
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        if not data:
            if self.required:
                raise forms.ValidationError(
                    self.error_messages["required"], code="required"
                )
            return []
        if not isinstance(data, (list, tuple)):
            data = [data]
        return [super().clean(item, initial) for item in data]


class PedidoForm(forms.ModelForm):
    """Registro de requisição pelo solicitante (produto, urgência e cotação)."""

    possui_cotacao = forms.TypedChoiceField(
        label="Possui cotação?",
        choices=[("sim", "Sim"), ("nao", "Não")],
        coerce=lambda valor: valor == "sim",
        widget=forms.RadioSelect(),
        initial="nao",
    )

    class Meta:
        model = Pedido
        fields = ["produto", "urgencia", "possui_cotacao"]
        widgets = {
            "produto": forms.TextInput(
                attrs={"class": "campo", "placeholder": "Ex.: Cadeira de escritório"}
            ),
            "urgencia": forms.Select(attrs={"class": "campo"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.is_bound:
            atual = self.initial.get("possui_cotacao")
            self.initial["possui_cotacao"] = "sim" if atual in (True, "sim") else "nao"


class AnexosForm(forms.Form):
    """Upload de anexos (múltiplos) para um pedido."""

    arquivos = MultipleFileField(
        label="Anexos",
        required=False,
        validators=[validar_arquivo],
        widget=MultipleFileInput(attrs={"class": "campo"}),
        help_text="Máx. 10 MB por arquivo. Tipos: pdf, doc(x), xls(x), png, jpg, txt, csv, zip.",
    )


class TramitacaoForm(forms.Form):
    """Alteração de status pelo responsável, com observação e anexos."""

    status = forms.ChoiceField(label="Novo status", widget=forms.Select(attrs={"class": "campo"}))
    observacao = forms.CharField(
        label="Observação",
        required=False,
        widget=forms.Textarea(attrs={"class": "campo", "rows": 3}),
    )
    retorno_final = forms.CharField(
        label="Retorno final ao solicitante",
        required=False,
        widget=forms.Textarea(attrs={"class": "campo", "rows": 3}),
    )
    modalidade = forms.ChoiceField(
        label="Modalidade (RCA)",
        required=False,
        choices=[("", "—")] + list(Modalidade.choices),
        widget=forms.Select(attrs={"class": "campo"}),
    )
    data_envio = forms.DateField(
        label="Data de envio",
        required=False,
        widget=forms.DateInput(attrs={"type": "date", "class": "campo"}),
    )
    arquivos = MultipleFileField(
        label="Anexos",
        required=False,
        validators=[validar_arquivo],
        widget=MultipleFileInput(attrs={"class": "campo"}),
    )

    def __init__(self, *args, pedido=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.pedido = pedido
        if pedido is not None:
            self.fields["status"].choices = [
                (s.value, s.label) for s in pedido.transicoes_permitidas
            ]

    def clean(self):
        dados = super().clean()
        novo_status = dados.get("status")
        if novo_status == Status.CONCLUIDO and not (dados.get("retorno_final") or "").strip():
            self.add_error(
                "retorno_final",
                "Ao concluir o pedido, informe o retorno final ao solicitante.",
            )
        return dados
