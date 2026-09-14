from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DataType = Literal["texto", "numero", "fecha", "booleano", "tabla", "porcentaje"]


class ValidationRule(BaseModel):
    type: Literal["obligatorio", "min", "max"]
    value: str | None = None


class FieldDefinition(BaseModel):
    name: str
    data_type: DataType
    required: bool = False
    validation_rules: list[ValidationRule] = []
    # instruccion puntual de donde/como extraer este campo cuando el nombre y tipo de
    # dato no bastan para desambiguarlo (ej. "tomar el TOTAL fuera de la tabla, no el
    # subtotal de una fila"). Se guarda como parte del campo (no en el chat, que es
    # efimero) y viaja al LLM como la "description" de su propiedad en el JSON Schema
    # de extraccion (ver pipeline/json_schema.py) - asi el prompt general se mantiene
    # generico y la contextualizacion por campo queda donde corresponde: en la
    # configuracion del tipo de documento, persistida y versionada.
    description: str | None = None
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
