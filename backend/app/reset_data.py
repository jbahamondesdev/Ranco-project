"""Borra todos los datos de la base (tipos de documento, documentos, ejecuciones, etc.)
y los archivos en storage/, dejando la app en estado limpio. No borra el esquema.

Uso: uv run python -m app.reset_data
"""

import shutil

from app.config import get_settings
from app.db import SessionLocal
from app.models.document import Document
from app.models.document_type import DocumentType, DocumentTypeVersion
from app.models.execution import Execution, ExecutionEvent, ExtractionResult, MappedField
from app.models.workflow import Workflow


def reset_data() -> None:
    db = SessionLocal()
    try:
        for model in (
            MappedField,
            ExtractionResult,
            ExecutionEvent,
            Execution,
            Workflow,
            DocumentTypeVersion,
            Document,
            DocumentType,
        ):
            count = db.query(model).delete()
            print(f"borrados {count} registros de {model.__tablename__}")
        db.commit()
    finally:
        db.close()

    settings = get_settings()
    for sub in ("documents", "executions"):
        d = settings.storage_dir / sub
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)
    print("archivos en storage/ eliminados")


if __name__ == "__main__":
    reset_data()
