from typing import Literal

from pydantic import BaseModel

from app.schemas.document_type import DataType, FieldDefinition


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SuggestedColumn(BaseModel):
    name: str
    data_type: DataType
    description: str | None = None


PrimitiveValue = str | int | float | bool


class SuggestedField(BaseModel):
    name: str
    data_type: DataType
    required: bool = False
    # evidencia para que el usuario vea que el LLM lo extrajo de verdad
    # (el LLM puede devolver numeros reales para campos numericos, no solo texto)
    sample_value: PrimitiveValue | None = None
    # instruccion puntual de donde/como extraer este campo (ver FieldDefinition.description)
    # - el chat la puede fijar cuando el usuario da una aclaracion tipo "eso sacalo del
    # campo TOTAL, no de la tabla", para que la correccion quede en el campo mismo en vez
    # de perderse al cerrar la conversacion
    description: str | None = None
    # solo si data_type == "tabla"
    columns: list[SuggestedColumn] | None = None
    sample_rows: list[dict[str, PrimitiveValue | None]] | None = None


class DocumentChatRequest(BaseModel):
    messages: list[ChatMessage]
    current_fields: list[SuggestedField] = []


class DocumentChatResponse(BaseModel):
    reply: str
    fields: list[SuggestedField]


class PreviewExtractionRequest(BaseModel):
    # campos tal como los tiene el usuario en pantalla, todavia no guardados como
    # una version - mismo patron que "current_fields" en DocumentChatRequest
    fields_schema: list[FieldDefinition]


class MappedFieldPreviewOut(BaseModel):
    field_name: str
    data_type: DataType
    value: str | None
    confidence: float | None
    status: str
    reason: str | None


class PreviewExtractionResponse(BaseModel):
    fields: list[MappedFieldPreviewOut]
