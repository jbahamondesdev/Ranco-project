from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.document_type import FieldDefinition


class ExecutionEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    stage: str
    status: str
    message: str | None
    timestamp: datetime


class MappedFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    field_name: str
    data_type: str
    value: str | None
    confidence: float | None
    status: str
    reason: str | None
    corrected_value: str | None
    corrected_by_role: str | None
    corrected_at: datetime | None
    resolved: bool


class ExecutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    document_type_version_id: str
    workflow_id: str | None
    status: str
    seen: bool
    # true si queda al menos un MappedField con problema (needs_review/missing/warning)
    # sin corregir ni descartar desde Revision - permite que la UI muestre la ejecucion
    # como resuelta aunque "status" siga historicamente en needs_review
    has_unresolved_issues: bool
    confidence_threshold_used: float | None
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None


class ExtractionPreview(BaseModel):
    content_preview: str
    content_length: int
    table_count: int
    page_count: int


class ExecutionDetailOut(ExecutionOut):
    events: list[ExecutionEventOut] = []
    mapped_fields: list[MappedFieldOut] = []
    document_filename: str
    document_type_name: str
    document_type_version_number: int
    fields_schema: list[FieldDefinition]
    extraction_preview: ExtractionPreview | None = None
    model_response_json: str | None = None


class ExecutionCreate(BaseModel):
    document_id: str
    workflow_id: str | None = None


class ResolveMappedFieldRequest(BaseModel):
    # si viene con valor, se guarda como correccion; si viene None, la alerta se
    # descarta sin modificar el valor extraido
    corrected_value: str | None = None
    role: str


class DocumentTypeStatsOut(BaseModel):
    document_type_id: str
    document_type_name: str
    total: int
    needs_review: int
    avg_confidence: float | None


class ExecutionStatsOut(BaseModel):
    total: int
    by_status: dict[str, int]
    avg_confidence: float | None
    avg_duration_seconds: float | None
    by_document_type: list[DocumentTypeStatsOut]
