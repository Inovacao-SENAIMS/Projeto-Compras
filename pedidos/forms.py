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
    """Registro de requisição pelo solicitante."""

    modalidade = forms.ChoiceField(
        label="Modalidade (RCA)",
        required=True,
        choices=[("", "Selecione a modalidade RCA")] + list(Modalidade.choices),
        widget=forms.Select(attrs={"class": "campo"}),
    )
    possui_cotacao = forms.TypedChoiceField(
        label="Possui cotação?",
        choices=[("sim", "Sim"), ("nao", "Não")],
        coerce=lambda valor: valor == "sim",
        widget=forms.RadioSelect(),
        initial="nao",
    )

    class Meta:
        model = Pedido
        fields = [
            "produto",
            "descricao_objeto",
            "quantidade",
            "modalidade",
            "urgencia",
            "possui_cotacao",
        ]
        widgets = {
            "produto": forms.TextInput(
                attrs={"class": "campo", "placeholder": "Ex.: Cadeira de escritório"}
            ),
            "descricao_objeto": forms.Textarea(
                attrs={
                    "class": "campo",
                    "rows": 3,
                    "placeholder": "Detalhes do item ou serviço (modelo, quantidade, especificação...)",
                }
            ),
            "quantidade": forms.NumberInput(
                attrs={"class": "campo", "min": 1, "step": 1}
            ),
            "urgencia": forms.Select(attrs={"class": "campo"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.is_bound:
            atual = self.initial.get("possui_cotacao")
            self.initial["possui_cotacao"] = "sim" if atual in (True, "sim") else "nao"


class AnexosForm(forms.Form):
    """Anexos do registro: Documentação (obrigatória) e Cotação (se houver)."""

    arquivos = MultipleFileField(
        label="Documentação",
        required=True,
        validators=[validar_arquivo],
        widget=MultipleFileInput(attrs={"class": "campo"}),
        help_text="Obrigatório. Máx. 10 MB por arquivo. Tipos: pdf, doc(x), xls(x), png, jpg, txt, csv, zip.",
    )
    arquivos_cotacao = MultipleFileField(
        label="Cotação",
        required=False,
        validators=[validar_arquivo],
        widget=MultipleFileInput(attrs={"class": "campo"}),
        help_text="Anexe o arquivo da cotação (obrigatório quando 'Possui cotação? = Sim').",
    )

    def __init__(self, *args, possui_cotacao=False, **kwargs):
        super().__init__(*args, **kwargs)
        self.possui_cotacao = possui_cotacao

    def clean(self):
        dados = super().clean()
        if self.possui_cotacao and not dados.get("arquivos_cotacao"):
            self.add_error(
                "arquivos_cotacao",
                "Você indicou que possui cotação — anexe o arquivo da cotação.",
            )
        return dados


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
        required=True,
        choices=[("", "Selecione a modalidade RCA")] + list(Modalidade.choices),
        widget=forms.Select(attrs={"class": "campo"}),
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
            if pedido.modalidade:
                self.fields["modalidade"].initial = pedido.modalidade

    def clean(self):
        dados = super().clean()
        novo_status = dados.get("status")
        if novo_status == Status.CONCLUIDA and not (dados.get("retorno_final") or "").strip():
            self.add_error(
                "retorno_final",
                "Ao concluir a requisição, informe o retorno final ao solicitante.",
            )
        return dados
