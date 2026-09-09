from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db import engine
from app.routers import chat, document_types, documents, executions, workflows

app = FastAPI(title="Plataforma de extracción y mapeo de documentos")

app.add_middleware(
    CORSMiddleware,
    # entorno local: acepta localhost/127.0.0.1 en cualquier puerto (Vite puede
    # correr en 5173 o, si ese puerto ya esta ocupado, en el siguiente libre).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(document_types.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(workflows.router)
app.include_router(executions.router)


@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}
