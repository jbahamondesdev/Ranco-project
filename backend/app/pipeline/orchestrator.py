import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.document import Document
from app.models.document_type import DocumentTypeVersion
from app.models.execution import Execution, ExecutionEvent, ExtractionResult, MappedField
from app.pipeline import mapping, validation
from app.pipeline.document_intelligence import AzureNotConfiguredError, analyze_document
from app.pipeline.json_schema import build_extraction_json_schema

MAX_RETRIES = 2


def _log_event(db: Session, execution: Execution, stage: str, status: str, message: str | None = None):
    db.add(ExecutionEvent(execution_id=execution.id, stage=stage, status=status, message=message))
    db.commit()


def _run_with_retry(db: Session, execution: Execution, stage: str, fn):
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            _log_event(db, execution, stage, "started", f"intento {attempt}")
            result = fn()
            _log_event(db, execution, stage, "ok")
            return result
        except AzureNotConfiguredError:
            raise
        except Exception as exc:  # fallas transitorias: reintenta
            last_error = exc
            _log_event(db, execution, stage, "retry", str(exc))
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
        mapping_result = _run_with_retry(
            db,
            execution,
            "mapping",
            lambda: mapping.map_fields(di_result.content_text, fields_schema, extraction_schema),
        )
        execution.model_response_json = mapping_result.raw_response_json
        db.commit()

        # --- validacion ---
        execution.status = "validating"
        db.commit()
        field_thresholds = execution.workflow.field_thresholds if execution.workflow else {}
        validated, needs_review, threshold_used = validation.validate_mapped_fields(
            mapping_result.fields, fields_schema, field_thresholds
        )
        execution.confidence_threshold_used = threshold_used
        _log_event(db, execution, "validation", "ok")

        data_type_by_name = {f["name"]: f.get("data_type", "texto") for f in fields_schema}
        for field in validated:
            db.add(
                MappedField(
                    execution_id=execution.id,
                    field_name=field["field_name"],
                    data_type=data_type_by_name.get(field["field_name"], "texto"),
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
        execution.status = "error"
        execution.error_message = str(exc)
        execution.completed_at = datetime.now(timezone.utc)
        _log_event(db, execution, "config", "error", str(exc))
        db.commit()
    except Exception as exc:
        execution.status = "error"
        execution.error_message = str(exc)
        execution.completed_at = datetime.now(timezone.utc)
        _log_event(db, execution, "pipeline", "error", str(exc))
        db.commit()
