import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import (
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
    SessionLocal,
    get_by_public_id,
    get_db,
    get_or_404,
    paginate,
)
from app.models.document import Document
from app.models.document_type import DocumentTypeVersion
from app.models.execution import Execution, ExecutionEvent, MappedField
from app.models.workflow import Workflow
from app.pipeline import export
from app.pipeline.orchestrator import run_execution
from app.pipeline.stats import ISSUE_STATUSES, compute_execution_stats, has_unresolved_issues
from app.schemas.execution import (
    ExecutionCreate,
    ExecutionDetailOut,
    ExecutionOut,
    ExecutionStatsOut,
    MappedFieldOut,
    ResolveMappedFieldRequest,
)

router = APIRouter(prefix="/executions", tags=["executions"])


def _executions_with_issues_query(execution_ids: list[int] | None = None):
    # una vez que un campo se corrige o se descarta desde Revision (resolved=True) deja
    # de contar como alerta pendiente, aunque su "status" original siga siendo el mismo.
    # `execution_ids`, cuando se pasa, acota el scan a esas ejecuciones (ej. la página
    # actual) en vez de recorrer toda la tabla mapped_fields.
    query = (
        select(MappedField.execution_id)
        .where(MappedField.status.in_(ISSUE_STATUSES), MappedField.resolved == False)  # noqa: E712
        .distinct()
    )
    if execution_ids is not None:
        query = query.where(MappedField.execution_id.in_(execution_ids))
    return query


def _execution_out(execution: Execution, has_unresolved_issues: bool) -> dict:
    return {
        "id": execution.public_id,
        "document_id": execution.document.public_id,
        "document_type_version_id": execution.document_type_version.public_id,
        "workflow_id": execution.workflow.public_id if execution.workflow_id else None,
        "status": execution.status,
        "seen": execution.seen,
        "has_unresolved_issues": has_unresolved_issues,
        "confidence_threshold_used": execution.confidence_threshold_used,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
        "error_message": execution.error_message,
    }


def _event_out(event: ExecutionEvent) -> dict:
    return {
        "id": event.public_id,
        "stage": event.stage,
        "status": event.status,
        "message": event.message,
        "timestamp": event.timestamp,
    }


def _mapped_field_out(field: MappedField) -> dict:
    return {
        "id": field.public_id,
        "field_name": field.field_name,
        "data_type": field.data_type,
        "value": field.value,
        "confidence": field.confidence,
        "status": field.status,
        "reason": field.reason,
        "corrected_value": field.corrected_value,
        "corrected_by_role": field.corrected_by_role,
        "corrected_at": field.corrected_at,
        "resolved": field.resolved,
    }


def _run_in_background(execution_id: int) -> None:
    db = SessionLocal()
    try:
        run_execution(execution_id, db)
    finally:
        db.close()


def _latest_published_version(db: Session, document_type_id: int) -> DocumentTypeVersion:
    version = db.scalar(
        select(DocumentTypeVersion)
        .where(
            DocumentTypeVersion.document_type_id == document_type_id,
            DocumentTypeVersion.status == "published",
        )
        .order_by(DocumentTypeVersion.version_number.desc())
    )
    if not version:
        raise HTTPException(409, "El tipo de documento no tiene ninguna versión publicada")
    return version


def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    csv.writer(buffer).writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=list[ExecutionOut])
def list_executions(
    status: str | None = None,
    workflow_id: str | None = None,
    has_issues: bool | None = None,
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(Execution).options(
        selectinload(Execution.document),
        selectinload(Execution.document_type_version),
        selectinload(Execution.workflow),
    )
    if status:
        query = query.where(Execution.status == status)
    if workflow_id is not None:
        workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")
        query = query.where(Execution.workflow_id == workflow.id)
    if has_issues:
        query = query.where(Execution.id.in_(_executions_with_issues_query()))
    query = query.order_by(Execution.started_at.desc())
    executions = db.scalars(paginate(query, limit, offset)).all()

    issue_ids = set(db.scalars(_executions_with_issues_query([e.id for e in executions])).all())
    return [_execution_out(e, e.id in issue_ids) for e in executions]


@router.get("/unseen-issues-count")
def count_unseen_issues(db: Session = Depends(get_db)):
    count = db.scalar(
        select(func.count())
        .select_from(Execution)
        .where(
            Execution.id.in_(_executions_with_issues_query()),
            Execution.seen == False,  # noqa: E712
        )
    )
    return {"count": count or 0}


@router.get("/export")
def export_executions(
    workflow_id: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    """CSV agregado: una fila por ejecucion, una columna por campo mapeado (union de
    los nombres de campo vistos en las ejecuciones incluidas - normalmente estable
    porque todas comparten el mismo tipo de documento cuando se filtra por workflow)."""
    workflow_internal_id = None
    if workflow_id is not None:
        workflow_internal_id = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado").id

    executions = export.fetch_executions_for_export(db, workflow_id=workflow_internal_id, status=status)
    rows = export.executions_summary_csv_rows(executions)
    filename = f"ejecuciones_{workflow_id}.csv" if workflow_id else "ejecuciones.csv"
    return _csv_response(rows, filename)


@router.get("/{execution_id}/export")
def export_execution(execution_id: str, db: Session = Depends(get_db)):
    execution = get_or_404(db, Execution, execution_id, "Ejecución no encontrada")
    rows = export.execution_fields_csv_rows(execution)
    return _csv_response(rows, f"ejecucion_{execution.public_id}.csv")


@router.get("/stats", response_model=ExecutionStatsOut)
def get_execution_stats(db: Session = Depends(get_db)):
    return compute_execution_stats(db)


@router.get("/{execution_id}", response_model=ExecutionDetailOut)
def get_execution(execution_id: str, db: Session = Depends(get_db)):
    # ya no marca "seen" automaticamente aca: este endpoint se llama en loop (polling)
    # mientras el usuario mira una ejecucion recien disparada terminar en vivo, y eso
    # la marcaba como vista antes de que el usuario tuviera oportunidad de notarlo en
    # Revision. Ver POST /{execution_id}/mark-seen, que el frontend llama solo cuando
    # abre una ejecucion que YA estaba terminada al momento de entrar.
    execution = db.scalar(
        select(Execution)
        .options(
            selectinload(Execution.document),
            selectinload(Execution.document_type_version).selectinload(DocumentTypeVersion.document_type),
            selectinload(Execution.workflow),
            selectinload(Execution.extraction_result),
            selectinload(Execution.events),
            selectinload(Execution.mapped_fields),
        )
        .where(Execution.public_id == execution_id)
    )
    if not execution:
        raise HTTPException(404, "Ejecución no encontrada")

    document = execution.document
    version = execution.document_type_version
    document_type = version.document_type

    extraction_preview = None
    if execution.extraction_result:
        try:
            raw = json.loads(
                Path(execution.extraction_result.raw_di_response_path).read_text(encoding="utf-8")
            )
            content = raw.get("content", "")
            extraction_preview = {
                "content_preview": content[:500],
                "content_length": len(content),
                "table_count": len(raw.get("tables", [])),
                "page_count": len(raw.get("pages", [])),
            }
        except Exception:
            extraction_preview = None

    return {
        "id": execution.public_id,
        "document_id": document.public_id,
        "document_type_version_id": version.public_id,
        "workflow_id": execution.workflow.public_id if execution.workflow_id else None,
        "status": execution.status,
        "seen": execution.seen,
        "has_unresolved_issues": has_unresolved_issues(execution.mapped_fields),
        "confidence_threshold_used": execution.confidence_threshold_used,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
        "error_message": execution.error_message,
        "events": [_event_out(e) for e in execution.events],
        "mapped_fields": [_mapped_field_out(f) for f in execution.mapped_fields],
        "document_filename": document.original_filename,
        "document_type_name": document_type.name,
        "document_type_version_number": version.version_number,
        "fields_schema": version.fields_schema,
        "extraction_preview": extraction_preview,
        "model_response_json": execution.model_response_json,
    }


@router.post("", response_model=ExecutionOut, status_code=201)
def create_execution(
    payload: ExecutionCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    document = get_or_404(db, Document, payload.document_id, "Documento no encontrado")

    workflow: Workflow | None = None
    document_type_id = document.document_type_id

    if payload.workflow_id is not None:
        workflow = get_or_404(db, Workflow, payload.workflow_id, "Flujo no encontrado")
        if workflow.status != "active":
            raise HTTPException(409, "El flujo está pausado")
        if not workflow.document_type_id:
            raise HTTPException(409, "El flujo no tiene un tipo de documento configurado")
        document_type_id = workflow.document_type_id
        document.document_type_id = document_type_id  # el flujo clasifica el documento

    if not document_type_id:
        raise HTTPException(409, "El documento aún no tiene un tipo de documento asignado")

    version = _latest_published_version(db, document_type_id)

    execution = Execution(
        document_id=document.id,
        document_type_version_id=version.id,
        workflow_id=workflow.id if workflow else None,
        status="pending",
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    background_tasks.add_task(_run_in_background, execution.id)
    return _execution_out(execution, has_unresolved_issues=False)


@router.post("/{execution_id}/mark-seen", response_model=ExecutionOut)
def mark_execution_seen(execution_id: str, db: Session = Depends(get_db)):
    execution = get_or_404(db, Execution, execution_id, "Ejecución no encontrada")

    if not execution.seen:
        execution.seen = True
        db.commit()
        db.refresh(execution)

    return _execution_out(execution, has_unresolved_issues(execution.mapped_fields))


@router.post("/{execution_id}/mapped-fields/{field_id}/resolve", response_model=MappedFieldOut)
def resolve_mapped_field(
    execution_id: str, field_id: str, payload: ResolveMappedFieldRequest, db: Session = Depends(get_db)
):
    execution = get_or_404(db, Execution, execution_id, "Ejecución no encontrada")

    field = get_by_public_id(db, MappedField, field_id)
    if not field or field.execution_id != execution.id:
        raise HTTPException(404, "Campo no encontrado")

    if payload.corrected_value is not None:
        field.corrected_value = payload.corrected_value
    field.corrected_by_role = payload.role
    field.corrected_at = datetime.now(timezone.utc)
    field.resolved = True
    db.commit()
    db.refresh(field)
    return _mapped_field_out(field)
