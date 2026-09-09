from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db, get_or_404
from app.models.document_type import DocumentType
from app.models.execution import Execution, ExecutionEvent, ExtractionResult, MappedField
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowOut, WorkflowUpdate

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _workflow_out(workflow: Workflow) -> dict:
    return {
        "id": workflow.public_id,
        "name": workflow.name,
        "status": workflow.status,
        "trigger_type": workflow.trigger_type,
        "document_type_id": workflow.document_type.public_id if workflow.document_type_id else None,
        "destination": workflow.destination,
        "field_thresholds": workflow.field_thresholds,
        "created_at": workflow.created_at,
        "updated_at": workflow.updated_at,
    }


def _resolve_document_type_id(db: Session, public_id: str | None) -> int | None:
    if not public_id:
        return None
    return get_or_404(db, DocumentType, public_id, "Tipo de documento no encontrado").id


@router.get("", response_model=list[WorkflowOut])
def list_workflows(db: Session = Depends(get_db)):
    workflows = db.scalars(select(Workflow).order_by(Workflow.created_at.desc())).all()
    return [_workflow_out(w) for w in workflows]


@router.post("", response_model=WorkflowOut, status_code=201)
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Workflow).where(Workflow.name == payload.name)):
        raise HTTPException(409, "Ya existe un flujo con ese nombre")
    workflow = Workflow(
        name=payload.name,
        document_type_id=_resolve_document_type_id(db, payload.document_type_id),
        destination=payload.destination,
        trigger_type=payload.trigger_type,
        field_thresholds={k: v.model_dump() for k, v in payload.field_thresholds.items()},
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return _workflow_out(workflow)


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")
    return _workflow_out(workflow)


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(workflow_id: str, payload: WorkflowUpdate, db: Session = Depends(get_db)):
    workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")

    existing = db.scalar(select(Workflow).where(Workflow.name == payload.name))
    if existing and existing.id != workflow.id:
        raise HTTPException(409, "Ya existe un flujo con ese nombre")

    workflow.name = payload.name
    workflow.document_type_id = _resolve_document_type_id(db, payload.document_type_id)
    workflow.destination = payload.destination
    workflow.trigger_type = payload.trigger_type
    workflow.field_thresholds = {k: v.model_dump() for k, v in payload.field_thresholds.items()}
    db.commit()
    db.refresh(workflow)
    return _workflow_out(workflow)


@router.post("/{workflow_id}/pause", response_model=WorkflowOut)
def pause_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")
    workflow.status = "paused"
    db.commit()
    db.refresh(workflow)
    return _workflow_out(workflow)


@router.post("/{workflow_id}/resume", response_model=WorkflowOut)
def resume_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")
    workflow.status = "active"
    db.commit()
    db.refresh(workflow)
    return _workflow_out(workflow)


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = get_or_404(db, Workflow, workflow_id, "Flujo no encontrado")

    execution_ids = list(
        db.scalars(select(Execution.id).where(Execution.workflow_id == workflow.id)).all()
    )
    if execution_ids:
        db.query(MappedField).filter(MappedField.execution_id.in_(execution_ids)).delete(
            synchronize_session=False
        )
        db.query(ExecutionEvent).filter(ExecutionEvent.execution_id.in_(execution_ids)).delete(
            synchronize_session=False
        )
        db.query(ExtractionResult).filter(ExtractionResult.execution_id.in_(execution_ids)).delete(
            synchronize_session=False
        )
        db.query(Execution).filter(Execution.id.in_(execution_ids)).delete(synchronize_session=False)

    db.delete(workflow)
    db.commit()
