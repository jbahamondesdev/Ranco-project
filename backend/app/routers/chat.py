import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_by_public_id, get_db
from app.models.document import Document
from app.pipeline import extraction, mapping
from app.pipeline.document_intelligence import AzureNotConfiguredError, analyze_document_cached
from app.pipeline.field_chat import suggest_fields
from app.pipeline.json_schema import build_extraction_json_schema
from app.schemas.chat import (
    DocumentChatRequest,
    DocumentChatResponse,
    PreviewExtractionRequest,
    PreviewExtractionResponse,
)

router = APIRouter(prefix="/documents", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/{document_id}/chat", response_model=DocumentChatResponse)
def chat_with_document(document_id: str, payload: DocumentChatRequest, db: Session = Depends(get_db)):
    document = get_by_public_id(db, Document, document_id)
    if not document:
        raise HTTPException(404, "Documento no encontrado")

    try:
        di_result = analyze_document_cached(document.storage_path)
    except AzureNotConfiguredError as exc:
        return DocumentChatResponse(reply=str(exc), fields=payload.current_fields)

    try:
        result = suggest_fields(
            content_text=di_result.content_text,
            messages=[m.model_dump() for m in payload.messages],
            current_fields=[f.model_dump() for f in payload.current_fields],
        )
    except AzureNotConfiguredError as exc:
        return DocumentChatResponse(reply=str(exc), fields=payload.current_fields)
    except Exception:
        logger.exception("Fallo llamando al LLM para sugerir campos (documento %s)", document_id)
        return DocumentChatResponse(
            reply="No pude interpretar la respuesta del modelo, intenta reformular tu mensaje.",
            fields=payload.current_fields,
        )

    try:
        return DocumentChatResponse(**result)
    except Exception:
        logger.exception("Respuesta del LLM no calzo con el esquema esperado: %r", result)
        return DocumentChatResponse(
            reply=result.get("reply", "Listo.") if isinstance(result, dict) else "Listo.",
            fields=payload.current_fields,
        )


@router.post("/{document_id}/preview-extraction", response_model=PreviewExtractionResponse)
def preview_extraction(document_id: str, payload: PreviewExtractionRequest, db: Session = Depends(get_db)):
    """Corre el mismo motor de mapeo que se usa al procesar un documento de verdad
    (ver pipeline/orchestrator.py) sobre el documento de referencia, con los campos
    que el usuario tiene configurados en pantalla (todavia sin guardar como version).
    Asi lo que se ve al configurar un tipo es exactamente lo que va a pasar despues
    al ejecutar un workflow - no una aproximacion generada por el chat."""
    document = get_by_public_id(db, Document, document_id)
    if not document:
        raise HTTPException(404, "Documento no encontrado")

    if not payload.fields_schema:
        return PreviewExtractionResponse(fields=[])

    try:
        di_result = analyze_document_cached(document.storage_path)
    except AzureNotConfiguredError as exc:
        raise HTTPException(409, str(exc)) from exc

    fields_schema = [f.model_dump() for f in payload.fields_schema]
    extraction_schema = build_extraction_json_schema(fields_schema)

    try:
        mapping_result = mapping.map_fields(di_result.content_text, fields_schema, extraction_schema)
    except AzureNotConfiguredError as exc:
        raise HTTPException(409, str(exc)) from exc

    annotated, _, _ = extraction.validate_and_annotate(mapping_result.fields, fields_schema)
    return PreviewExtractionResponse(fields=annotated)
