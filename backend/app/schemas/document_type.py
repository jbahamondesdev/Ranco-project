from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DataType = Literal["texto", "numero", "fecha", "booleano", "tabla"]


class ValidationRule(BaseModel):
    type: Literal["obligatorio", "regex", "min", "max"]
    value: str | None = None


class FieldDefinition(BaseModel):
    name: str
    data_type: DataType
    required: bool = False
    validation_rules: list[ValidationRule] = []
    # solo si data_type == "tabla": definicion de columnas
    columns: list["FieldDefinition"] | None = None


class DocumentTypeCreate(BaseModel):
    name: str


class DocumentTypeUpdate(BaseModel):
    name: str


class DocumentTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: str
    created_at: datetime


class DocumentTypeVersionCreate(BaseModel):
    fields_schema: list[FieldDefinition]
    reference_document_id: str | None = None


class DocumentTypeVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_type_id: str
    version_number: int
    fields_schema: list[FieldDefinition]
    reference_document_id: str | None
    extraction_schema: dict | None
    status: str
    created_at: datetime
    published_at: datetime | None


class DocumentTypeDetailOut(DocumentTypeOut):
    versions: list[DocumentTypeVersionOut] = []


FieldDefinition.model_rebuild()
