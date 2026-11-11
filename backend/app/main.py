"""
main.py — API "Projeto Compras" (FastAPI).

Superfície única RESTful (app/rest.py): recursos no path, Bearer token e
códigos HTTP corretos. Os "actions" legados do Apps Script foram removidos —
o frontend fala REST por completo via adapter em frontend/js/api.js.
"""
import os
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .database import Base, engine
from .seed import garantir_admin

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("projeto-compras")

app = FastAPI(title="Projeto Compras API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # em produção atrás do nginx é same-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Superfície RESTful — casos de uso do negócio (auth, pedidos, anexos,
# usuários, agregações, reset).
from .rest import router as rest_router  # noqa: E402
app.include_router(rest_router)


@app.get("/api/health")
def health():
    return {"ok": True, "data": {"status": "up", "version": app.version}}


# ------------------------------ inicialização ------------------------------
# Substitui inicializar() + criarGestorInicial() do Setup.gs (idempotente).

def inicializar() -> None:
    os.makedirs(config.ANEXOS_DIR, exist_ok=True)
    Base.metadata.create_all(engine)
    if not config.SEED_ADMIN:
        return
    from .database import SessionLocal

    db = SessionLocal()
    try:
        garantir_admin(db)
    finally:
        db.close()


@app.on_event("startup")
def startup() -> None:
    inicializar()
