import json
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.document import Document
from app.models.document_type import DocumentTypeVersion
from app.models.execution import Execution, ExecutionEvent, ExtractionResult, MappedField
from app.pipeline import extraction, feedback, mapping, notifications
from app.pipeline.document_intelligence import AzureNotConfiguredError, analyze_document
from app.pipeline.json_schema import build_extraction_json_schema

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
_MAX_ERROR_MESSAGE_LENGTH = 300
_PATH_PATTERN = re.compile(r"[A-Za-z]:\\[^\s\"']+|/(?:[\w.\-]+/)+[\w.\-]+")


def _safe_error_message(exc: Exception) -> str:
    """Mensaje acotado para guardar en la ejecucion y mostrar en la UI de monitoreo.

    El traceback completo (con paths, datos del SDK, etc.) siempre queda en los logs
    del servidor via logger.exception - esto es solo lo que ve el usuario final, asi
    que se le quitan paths absolutos del filesystem y se trunca si es muy largo."""
    message = str(exc).strip() or exc.__class__.__name__
    message = _PATH_PATTERN.sub("[ruta omitida]", message)
    if len(message) > _MAX_ERROR_MESSAGE_LENGTH:
        message = message[:_MAX_ERROR_MESSAGE_LENGTH].rstrip() + "…"
    return message


def _log_event(db: Session, execution: Execution, stage: str, status: str, message: str | None = None):
    db.add(ExecutionEvent(execution_id=execution.id, stage=stage, status=status, message=message))
    db.commit()


def _run_with_retry(db: Session, execution: Execution, stage: str, fn, extra_info: str | None = None):
    settings = get_settings()
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            message = f"intento {attempt}" + (f" ({extra_info})" if extra_info else "")
            _log_event(db, execution, stage, "started", message)
            result = fn()
            _log_event(db, execution, stage, "ok")
            return result
        except AzureNotConfiguredError:
            raise
        except Exception as exc:  # fallas transitorias: reintenta
            last_error = exc
            logger.warning("Fallo transitorio en stage=%s intento=%s", stage, attempt, exc_info=exc)
            _log_event(db, execution, stage, "retry", _safe_error_message(exc))
            if attempt <= MAX_RETRIES:
                time.sleep(settings.retry_backoff_seconds * attempt)
    raise last_error  # type: ignore[misc]


def run_execution(execution_id: int, db: Session) -> None:
    settings = get_settings()
    execution = db.get(Execution, execution_id)
    document = db.get(Document, execution.document_id)
    version = db.get(DocumentTypeVersion, execution.document_type_version_id)
    fields_schema = version.fields_schema

    try:
        # --- extraccion ---
        execution.status = "extracting"
        db.commit()
        di_result = _run_with_retry(
            db, execution, "extraction", lambda: analyze_document(document.storage_path)
        )

        raw_path = settings.storage_dir / "executions" / str(execution.id) / "di_raw.json"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_text(json.dumps(di_result.raw_response, ensure_ascii=False), encoding="utf-8")
        db.add(ExtractionResult(execution_id=execution.id, raw_di_response_path=str(raw_path)))
        db.commit()

        # --- mapeo ---
        execution.status = "mapping"
        db.commit()
        extraction_schema = version.extraction_schema or build_extraction_json_schema(fields_schema)
        examples = feedback.recent_correction_examples(db, version.document_type_id)
        mapping_info = f"contenido: {len(di_result.content_text)} caracteres"
        mapping_result = _run_with_retry(
            db,
            execution,
            "mapping",
            lambda: mapping.map_fields(di_result.content_text, fields_schema, extraction_schema, examples),
            extra_info=mapping_info,
        )
        execution.model_response_json = mapping_result.raw_response_json
        db.commit()

        # --- validacion ---
        execution.status = "validating"
        db.commit()
        field_thresholds = execution.workflow.field_thresholds if execution.workflow else {}
        annotated, needs_review, threshold_used = extraction.validate_and_annotate(
            mapping_result.fields, fields_schema, field_thresholds
        )
        execution.confidence_threshold_used = threshold_used
        _log_event(db, execution, "validation", "ok")

        for field in annotated:
            db.add(
                MappedField(
                    execution_id=execution.id,
                    field_name=field["field_name"],
                    data_type=field["data_type"],
                    value=field["value"],
                    confidence=field["confidence"],
                    status=field["status"],
                    reason=field["reason"],
                )
            )

        execution.status = "needs_review" if needs_review else "completed"
        execution.completed_at = datetime.now(timezone.utc)
        db.commit()

    except AzureNotConfiguredError as exc:
        # mensaje deliberadamente especifico y seguro (ver document_intelligence.py /
        # mapping.py): indica al usuario exactamente que configurar, se muestra tal cual.
        execution.status = "error"
        execution.error_message = str(exc)
        execution.completed_at = datetime.now(timezone.utc)
        _log_event(db, execution, "config", "error", str(exc))
        db.commit()
    except Exception as exc:
        logger.exception("Fallo no controlado ejecutando la ejecucion %s", execution_id)
        execution.status = "error"
        execution.error_message = _safe_error_message(exc)
        execution.completed_at = datetime.now(timezone.utc)
        _log_event(db, execution, "pipeline", "error", _safe_error_message(exc))
        db.commit()

    notifications.notify_execution_complete(execution)
