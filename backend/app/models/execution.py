import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# pending -> extracting -> mapping -> validating -> (needs_review | completed) | error


class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # id publico (UUID) usado en URLs y respuestas de la API - el entero interno solo
    # se usa para relaciones (FKs) dentro de la base de datos
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    document_type_version_id: Mapped[int] = mapped_column(ForeignKey("document_type_versions.id"))
    workflow_id: Mapped[int | None] = mapped_column(ForeignKey("workflows.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # umbral de confianza que realmente se aplico en esta ejecucion (del workflow, o el
    # default global si no habia override) - se guarda para que la vista de detalle no
    # dependa de que el default global no haya cambiado despues
    confidence_threshold_used: Mapped[float | None] = mapped_column(Float, nullable=True)
    # respuesta cruda (texto JSON) que devolvio el modelo de IA en el paso de mapeo,
    # antes de convertirse en los MappedField procesados - se guarda tal cual para
    # poder verla despues en el historial de ejecuciones
    model_response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # si el usuario ya abrio el detalle de esta ejecucion una vez que quedo en un estado
    # terminal - usado para el contador de notificaciones sin ver en Revision
    seen: Mapped[bool] = mapped_column(default=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    document = relationship("Document", back_populates="executions")
    document_type_version = relationship("DocumentTypeVersion")
    workflow = relationship("Workflow")
    events: Mapped[list["ExecutionEvent"]] = relationship(
        back_populates="execution", order_by="ExecutionEvent.timestamp"
    )
    extraction_result: Mapped["ExtractionResult | None"] = relationship(
        back_populates="execution", uselist=False
    )
    mapped_fields: Mapped[list["MappedField"]] = relationship(back_populates="execution")


class ExecutionEvent(Base):
    __tablename__ = "execution_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    execution_id: Mapped[int] = mapped_column(ForeignKey("executions.id"))
    stage: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20))  # started | ok | error | retry
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    execution = relationship("Execution", back_populates="events")


class ExtractionResult(Base):
    __tablename__ = "extraction_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[int] = mapped_column(ForeignKey("executions.id"), unique=True)
    raw_di_response_path: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    execution = relationship("Execution", back_populates="extraction_result")


class MappedField(Base):
    __tablename__ = "mapped_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    execution_id: Mapped[int] = mapped_column(ForeignKey("executions.id"))
    field_name: Mapped[str] = mapped_column(String(200))
    data_type: Mapped[str] = mapped_column(String(20), default="texto")
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # ok | needs_review | missing | warning
    # explica en concreto por que quedo needs_review/missing (baja confianza, fuera de
    # rango min/max, obligatorio ausente) - null cuando el status es "ok"
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_by_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # true cuando un usuario ya corrigio o descarto la alerta de este campo desde Revision
    # - independiente de "status", que refleja el resultado original de la extraccion
    resolved: Mapped[bool] = mapped_column(default=False)

    execution = relationship("Execution", back_populates="mapped_fields")
