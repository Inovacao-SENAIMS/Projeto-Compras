"""models.py — substituto relacional da planilha "Compras_DB".

Abas → tabelas:
  Usuarios → usuarios · Pedidos → pedidos · HistoricoStatus → historico_status
  AnexosAudit → anexos (drive_file_id → caminho local no volume)
  Sessoes → sessoes · ResetSenha → reset_senha
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome_completo: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    grupo: Mapped[str] = mapped_column(String(64))
    senha_hash: Mapped[str] = mapped_column(String(255))
    salt: Mapped[str] = mapped_column(String(64), default="")
    area_atuacao: Mapped[str] = mapped_column(String(255), default="")
    cargo: Mapped[str] = mapped_column(String(255), default="")
    instituto: Mapped[str] = mapped_column(String(255), default="")
    telefone: Mapped[str] = mapped_column(String(64), default="")
    ramal: Mapped[str] = mapped_column(String(64), default="")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)


class Pedido(Base):
    __tablename__ = "pedidos"

    numero: Mapped[str] = mapped_column(String(16), primary_key=True)
    produto: Mapped[str] = mapped_column(String(255))
    descricao_objeto: Mapped[str] = mapped_column(Text, default="")
    quantidade: Mapped[int] = mapped_column(Integer, default=1)
    modalidade: Mapped[str] = mapped_column(String(64), default="")
    urgencia: Mapped[str] = mapped_column(String(32), default="baixa")
    possui_cotacao: Mapped[bool] = mapped_column(Boolean, default=False)
    solicitante_nome: Mapped[str] = mapped_column(String(255), default="")
    criado_por: Mapped[str] = mapped_column(String(255), index=True)
    data_envio: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    responsavel: Mapped[str] = mapped_column(String(255), default="", index=True)
    retorno_final: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)
    assumido_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class HistoricoStatus(Base):
    __tablename__ = "historico_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_req: Mapped[str] = mapped_column(String(16), index=True)
    de: Mapped[str] = mapped_column(String(32), default="")
    para: Mapped[str] = mapped_column(String(32))
    usuario: Mapped[str] = mapped_column(String(255))
    observacao: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime)


class Anexo(Base):
    __tablename__ = "anexos"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # ANX-000001
    numero_req: Mapped[str] = mapped_column(String(16), index=True)
    tipo: Mapped[str] = mapped_column(String(32), default="documentacao")
    nome_original: Mapped[str] = mapped_column(String(255))
    caminho: Mapped[str] = mapped_column(String(512))  # substitui drive_file_id
    enviado_por: Mapped[str] = mapped_column(String(255))
    enviado_em: Mapped[datetime] = mapped_column(DateTime)


class Sessao(Base):
    __tablename__ = "sessoes"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime)


class ResetSenha(Base):
    __tablename__ = "reset_senha"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime)
    usado: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
