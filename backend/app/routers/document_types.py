from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, get_by_public_id, get_db, get_or_404, paginate
from app.models.document import Document
from app.models.document_type import DocumentType, DocumentTypeVersion
from app.models.execution import Execution
from app.models.workflow import Workflow
from app.pipeline.json_schema import build_extraction_json_schema
from app.schemas.document_type import (
    DocumentTypeCreate,
    DocumentTypeDetailOut,
    DocumentTypeOut,
    DocumentTypeUpdate,
    DocumentTypeVersionCreate,
    DocumentTypeVersionOut,
)

router = APIRouter(prefix="/document-types", tags=["document-types"])


def _document_type_out(doc_type: DocumentType) -> dict:
    return {
        "id": doc_type.public_id,
        "name": doc_type.name,
        "status": doc_type.status,
        "created_at": doc_type.created_at,
    }


def _version_out(version: DocumentTypeVersion) -> dict:
    return {
        "id": version.public_id,
        "document_type_id": version.document_type.public_id,
        "version_number": version.version_number,
        "fields_schema": version.fields_schema,
        "reference_document_id": (
            version.reference_document.public_id if version.reference_document_id else None
        ),
        "extraction_schema": version.extraction_schema,
        "status": version.status,
        "created_at": version.created_at,
        "published_at": version.published_at,
    }


def _document_type_detail_out(doc_type: DocumentType) -> dict:
    return {**_document_type_out(doc_type), "versions": [_version_out(v) for v in doc_type.versions]}


@router.get("", response_model=list[DocumentTypeOut])
def list_document_types(
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(DocumentType).order_by(DocumentType.created_at.desc())
    doc_types = db.scalars(paginate(query, limit, offset)).all()
    return [_document_type_out(dt) for dt in doc_types]


@router.post("", response_model=DocumentTypeOut, status_code=201)
def create_document_type(payload: DocumentTypeCreate, db: Session = Depends(get_db)):
    if db.scalar(select(DocumentType).where(DocumentType.name == payload.name)):
        raise HTTPException(409, "Ya existe un tipo de documento con ese nombre")
    doc_type = DocumentType(name=payload.name)
    db.add(doc_type)
    db.commit()
    db.refresh(doc_type)
    return _document_type_out(doc_type)


@router.get("/{document_type_id}", response_model=DocumentTypeDetailOut)
def get_document_type(document_type_id: str, db: Session = Depends(get_db)):
    doc_type = get_or_404(db, DocumentType, document_type_id, "Tipo de documento no encontrado")
    return _document_type_detail_out(doc_type)


@router.patch("/{document_type_id}", response_model=DocumentTypeOut)
def update_document_type(
    document_type_id: str, payload: DocumentTypeUpdate, db: Session = Depends(get_db)
):
    doc_type = get_or_404(db, DocumentType, document_type_id, "Tipo de documento no encontrado")

    existing = db.scalar(select(DocumentType).where(DocumentType.name == payload.name))
    if existing and existing.id != doc_type.id:
        raise HTTPException(409, "Ya existe un tipo de documento con ese nombre")

    doc_type.name = payload.name
    db.commit()
    db.refresh(doc_type)
    return _document_type_out(doc_type)


@router.delete("/{document_type_id}", status_code=204)
def delete_document_type(document_type_id: str, db: Session = Depends(get_db)):
    doc_type = get_or_404(db, DocumentType, document_type_id, "Tipo de documento no encontrado")

    workflows = db.scalars(
        select(Workflow).where(Workflow.document_type_id == doc_type.id)
    ).all()
    if workflows:
        names = ", ".join(f'"{w.name}"' for w in workflows)
        raise HTTPException(
            409,
            f"No se puede eliminar: el/los flujo(s) {names} usan este tipo de documento. "
            "Elimínalos o cámbiales el tipo primero.",
        )

    version_ids = [
        v.id
        for v in db.scalars(
            select(DocumentTypeVersion).where(DocumentTypeVersion.document_type_id == doc_type.id)
        ).all()
    ]
    if version_ids:
        execution_count = db.scalar(
            select(func.count())
            .select_from(Execution)
            .where(Execution.document_type_version_id.in_(version_ids))
        )
        if execution_count:
            raise HTTPException(
                409,
                f"No se puede eliminar: hay {execution_count} ejecución(es) que usaron este tipo "
                "de documento y quedarían sin su definición. Para eliminarlo igual, borra primero "
                "esas ejecuciones desde Workflows.",
            )

    # los documentos que quedaron "clasificados" con este tipo se desvinculan (no se
    # borran los archivos, solo pierden la etiqueta de clasificación)
    db.query(Document).filter(Document.document_type_id == doc_type.id).update(
        {Document.document_type_id: None}
    )
    db.query(DocumentTypeVersion).filter(
        DocumentTypeVersion.document_type_id == doc_type.id
    ).delete()
    db.delete(doc_type)
    db.commit()


@router.post(
    "/{document_type_id}/versions", response_model=DocumentTypeVersionOut, status_code=201
)
def create_version(
    document_type_id: str, payload: DocumentTypeVersionCreate, db: Session = Depends(get_db)
):
    doc_type = get_or_404(db, DocumentType, document_type_id, "Tipo de documento no encontrado")

    reference_document = None
    if payload.reference_document_id:
        reference_document = get_or_404(
            db, Document, payload.reference_document_id, "Documento de referencia no encontrado"
        )

    last_version = db.scalar(
        select(DocumentTypeVersion)
        .where(DocumentTypeVersion.document_type_id == doc_type.id)
        .order_by(DocumentTypeVersion.version_number.desc())
    )
    next_number = (last_version.version_number + 1) if last_version else 1
    fields_schema = [f.model_dump() for f in payload.fields_schema]

    version = DocumentTypeVersion(
        document_type_id=doc_type.id,
        version_number=next_number,
        fields_schema=fields_schema,
        reference_document_id=reference_document.id if reference_document else None,
        extraction_schema=build_extraction_json_schema(fields_schema),
        status="draft",
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return _version_out(version)


@router.post(
    "/{document_type_id}/versions/{version_id}/publish", response_model=DocumentTypeVersionOut
)
def publish_version(document_type_id: str, version_id: str, db: Session = Depends(get_db)):
    doc_type = get_or_404(db, DocumentType, document_type_id, "Tipo de documento no encontrado")

    version = get_by_public_id(db, DocumentTypeVersion, version_id)
    if not version or version.document_type_id != doc_type.id:
        raise HTTPException(404, "Versión no encontrada")

    version.status = "published"
    version.published_at = datetime.now(timezone.utc)
    doc_type.status = "published"

    db.commit()
    db.refresh(version)
    return _version_out(version)
