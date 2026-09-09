import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# active: corre normalmente | paused: no se puede ejecutar hasta reanudar


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    # manual: se sube un documento a mano | repository_polling: futuro, sondeo de un
    # repositorio (ej. SharePoint) - todavia no implementado
    trigger_type: Mapped[str] = mapped_column(String(30), default="manual")
    document_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    # por ahora el unico destino soportado es la base de datos interna
    destination: Mapped[str] = mapped_column(String(50), default="internal_db")
    # umbrales min/max por campo, definidos para este flujo especifico (no para el tipo
    # de documento): {nombre_campo: {"min": str|None, "max": str|None}}
    field_thresholds: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    document_type = relationship("DocumentType")
