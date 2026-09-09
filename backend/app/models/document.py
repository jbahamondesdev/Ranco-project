import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # id publico (UUID) usado en URLs y respuestas de la API - el entero interno solo
    # se usa para relaciones (FKs) dentro de la base de datos
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    original_filename: Mapped[str] = mapped_column(String(500))
    storage_path: Mapped[str] = mapped_column(String(1000))
    document_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_types.id"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    uploaded_by_role: Mapped[str] = mapped_column(String(20), default="operador")

    document_type = relationship("DocumentType")
    executions: Mapped[list["Execution"]] = relationship(back_populates="document")
