"""routers/usuarios.py — port de Usuarios.gs.

Regras preservadas:
  - Gestão gerencia apenas o Time_Compras; SuperUsuário gerencia todos;
  - ninguém gerencia a si mesmo;
  - exclusão bloqueada com requisições vinculadas (PROTECT);
  - SuperUsuário/ADMIN invisíveis nas listas.
"""
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from .. import config, security
from ..deps import (
    GRUPOS,
    ErroNegocio,
    buscar_usuario,
    eh_admin,
    exigir,
    exigir_email_institucional,
    exigir_nao_admin,
    is_equipe,
    is_manager,
    is_super,
    is_valido,
)
from ..models import Pedido, Sessao, Usuario

PERFIS_PERMITIDOS = [GRUPOS["SOLICITANTE"], GRUPOS["TIME"], GRUPOS["MANAGER"]]


def api_meus_dados(db: Session, usuario: Usuario, payload: dict):
    return {"ok": True, "data": {
        "nome_completo": usuario.nome_completo,
        "email": str(usuario.email).lower(),
        "grupo": str(usuario.grupo),
        "area_atuacao": usuario.area_atuacao,
        "cargo": usuario.cargo,
        "instituto": usuario.instituto,
        "telefone": usuario.telefone,
        "ramal": usuario.ramal,
        "ativo": is_valido(usuario),
    }}


def _usuario_publico(u: Usuario) -> dict:
    return {
        "nome_completo": u.nome_completo,
        "email": str(u.email).lower(),
        "grupo": str(u.grupo),
        "area_atuacao": u.area_atuacao,
        "cargo": u.cargo,
        "instituto": u.instituto,
        "telefone": u.telefone,
        "ramal": u.ramal,
        "ativo": is_valido(u),
    }


def api_listar_usuarios(db: Session, usuario: Usuario, payload: dict):
    exigir(is_manager(usuario), "Apenas a Gestão pode listar usuários.")

    usuarios = db.scalars(select(Usuario).order_by(Usuario.nome_completo)).all()
    # Invisíveis para todos: SuperUsuários e a conta ADMIN do sistema
    visiveis = [u for u in usuarios if not is_super(u)]

    eu = str(usuario.email).lower()
    data = []
    for u in visiveis:
        pub = _usuario_publico(u)
        pub["sou_eu"] = pub["email"] == eu
        pub["is_admin"] = eh_admin(pub["email"])
        data.append(pub)
    return {"ok": True, "data": data}


def _alvo_gerenciavel(db: Session, usuario: Usuario, email: str) -> Usuario:
    alvo = buscar_usuario(db, email)
    exigir(alvo, "Usuário não encontrado.")
    exigir(alvo.grupo != GRUPOS["SUPER"] or is_super(usuario),
           "Não é possível gerenciar uma conta de SuperUsuário.")
    return alvo


def api_alterar_status_usuario(db: Session, usuario: Usuario, payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    ativo = bool(payload.get("ativo"))
    exigir(is_manager(usuario) or is_super(usuario),
           "Sem permissão para gerenciar usuários.")
    exigir(email != str(usuario.email).lower(), "Ninguém gerencia a si mesmo.")
    exigir_nao_admin(email, "inativada")

    alvo = _alvo_gerenciavel(db, usuario, email)
    alvo.ativo = ativo
    if not ativo:
        # inativação encerra as sessões do usuário
        db.execute(delete(Sessao).where(Sessao.email == email))
    db.commit()
    return {"ok": True, "data": {"email": email, "ativo": ativo}}


def api_excluir_usuario(db: Session, usuario: Usuario, payload: dict):
    email = str(payload.get("email") or "").strip().lower()
    exigir(is_manager(usuario) or is_super(usuario),
           "Sem permissão para excluir usuários.")
    exigir(email != str(usuario.email).lower(), "Ninguém exclui a si mesmo.")
    exigir_nao_admin(email, "excluída")

    alvo = _alvo_gerenciavel(db, usuario, email)

    tem_pedidos = db.scalar(
        select(Pedido.numero).where(or_(
            Pedido.criado_por == email,
            Pedido.responsavel == email,
        )).limit(1)
    )
    exigir(not tem_pedidos,
           "Exclusão bloqueada: este usuário possui requisições vinculadas "
           "(criadas ou assumidas).")

    db.execute(delete(Sessao).where(Sessao.email == email))
    db.delete(alvo)
    db.commit()
    return {"ok": True, "data": {"email": email}}


def api_criar_usuario_admin(db: Session, usuario: Usuario, payload: dict):
    exigir(is_manager(usuario) or is_super(usuario),
           "Apenas a Gestão pode cadastrar usuários.")

    email = str(payload.get("email") or "").strip().lower()
    nome = str(payload.get("nome_completo") or "").strip()
    senha = str(payload.get("senha") or "")
    grupo = str(payload.get("grupo") or GRUPOS["SOLICITANTE"])

    exigir_email_institucional(email)
    exigir(nome, "Informe o nome completo.")
    exigir(len(senha) >= 6, "A senha deve ter ao menos 6 caracteres.")
    exigir(not buscar_usuario(db, email), "Já existe uma conta para este e-mail.")
    exigir(grupo in PERFIS_PERMITIDOS,
           "Perfil inválido. Use UserISI_IST, Time_Compras ou Manager_Compras.")

    db.add(Usuario(
        nome_completo=nome, email=email, grupo=grupo,
        senha_hash=security.hash_bcrypt(senha),
        area_atuacao=str(payload.get("area_atuacao") or ""),
        cargo=str(payload.get("cargo") or ""),
        instituto=str(payload.get("instituto") or ""),
        telefone=str(payload.get("telefone") or ""),
        ramal=str(payload.get("ramal") or ""),
        ativo=True,
    ))
    db.commit()
    return {"ok": True, "data": {"email": email, "grupo": grupo}}


def api_alterar_grupo_usuario(db: Session, usuario: Usuario, payload: dict):
    exigir(is_manager(usuario) or is_super(usuario),
           "Sem permissão para alterar perfis.")

    email = str(payload.get("email") or "").strip().lower()
    grupo = str(payload.get("grupo") or "")

    exigir(email != str(usuario.email).lower(), "Você não pode alterar o próprio perfil.")
    exigir_nao_admin(email, "alterada")
    exigir(grupo in PERFIS_PERMITIDOS,
           "Perfil inválido. Use UserISI_IST, Time_Compras ou Manager_Compras.")

    alvo = _alvo_gerenciavel(db, usuario, email)
    alvo.grupo = grupo
    db.commit()
    return {"ok": True, "data": {"email": email, "grupo": grupo}}


def api_alterar_senha(db: Session, usuario: Usuario, payload: dict):
    senha_atual = str(payload.get("senha_atual") or "")
    nova = str(payload.get("senha_nova") or "")
    nova2 = str(payload.get("senha_nova2") or "")
    exigir(senha_atual, "Informe a senha atual.")
    exigir(len(nova) >= 6, "A senha deve ter ao menos 6 caracteres.")
    exigir(not nova2 or nova == nova2, "As senhas não coincidem.")

    alvo = buscar_usuario(db, usuario.email)
    exigir(alvo, "Usuário não encontrado.")
    exigir(security.verificar_senha(senha_atual, alvo.senha_hash, alvo.salt),
           "Senha atual inválida.")

    alvo.salt = ""
    alvo.senha_hash = security.hash_bcrypt(nova)

    # Invalida sessões antigas deste usuário (mantém a atual).
    token_atual = str(payload.get("_token") or "")
    db.execute(delete(Sessao).where(
        Sessao.email == str(usuario.email).lower(),
        Sessao.token != token_atual,
    ))
    db.commit()
    return {"ok": True, "data": {"email": str(usuario.email).lower()}}


def api_lista_responsaveis(db: Session, usuario: Usuario, payload: dict):
    """Para o designar popup: membros do Time (+ Gestão). Super invisível."""
    ls = [u for u in db.scalars(select(Usuario)).all()
          if is_valido(u) and is_equipe(u) and not is_super(u)]
    return {"ok": True, "data": [
        {"email": str(u.email).lower(), "nome": u.nome_completo} for u in ls
    ]}
