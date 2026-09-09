import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class DocumentType(Base):
    __tablename__ = "document_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | published
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    versions: Mapped[list["DocumentTypeVersion"]] = relationship(
        back_populates="document_type", order_by="DocumentTypeVersion.version_number"
    )


class DocumentTypeVersion(Base):
    __tablename__ = "document_type_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    document_type_id: Mapped[int] = mapped_column(ForeignKey("document_types.id"))
    version_number: Mapped[int] = mapped_column(Integer)
    # fields_schema: list of {name, data_type, required, validation_rules: [...]}
    fields_schema: Mapped[list] = mapped_column(JSON)
    # documento subido como referencia al configurar esta version (para poder
    # volver a mostrar su preview al reabrir el tipo de documento)
    reference_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    # JSON Schema (Structured Outputs, strict) derivado de fields_schema, usado al
    # mapear documentos nuevos durante la ejecucion de un workflow.
    extraction_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | published
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    document_type: Mapped["DocumentType"] = relationship(back_populates="versions")
    reference_document = relationship("Document", foreign_keys=[reference_document_id])
