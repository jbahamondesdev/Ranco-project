from typing import Literal

from pydantic import BaseModel

from app.schemas.document_type import DataType


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SuggestedColumn(BaseModel):
    name: str
    data_type: DataType


PrimitiveValue = str | int | float | bool


class SuggestedField(BaseModel):
    name: str
    data_type: DataType
    required: bool = False
    # evidencia para que el usuario vea que el LLM lo extrajo de verdad
    # (el LLM puede devolver numeros reales para campos numericos, no solo texto)
    sample_value: PrimitiveValue | None = None
    # solo si data_type == "tabla"
    columns: list[SuggestedColumn] | None = None
    sample_rows: list[dict[str, PrimitiveValue | None]] | None = None


class DocumentChatRequest(BaseModel):
    messages: list[ChatMessage]
    current_fields: list[SuggestedField] = []


class DocumentChatResponse(BaseModel):
    reply: str
    fields: list[SuggestedField]
