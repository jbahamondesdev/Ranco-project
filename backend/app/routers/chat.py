import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_by_public_id, get_db
from app.models.document import Document
from app.pipeline.document_intelligence import (
    AzureNotConfiguredError,
    analyze_document_cached,
    extract_tables_preview,
)
from app.pipeline.field_chat import suggest_fields
from app.schemas.chat import DocumentChatRequest, DocumentChatResponse

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

    tables_preview = extract_tables_preview(di_result.raw_response)

    try:
        result = suggest_fields(
            content_text=di_result.content_text,
            tables_preview=tables_preview,
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
