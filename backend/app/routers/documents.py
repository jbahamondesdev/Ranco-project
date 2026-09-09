import mimetypes
import uuid

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, get_or_404
from app.models.document import Document
from app.schemas.document import DocumentOut

router = APIRouter(prefix="/documents", tags=["documents"])


def _document_out(document: Document) -> dict:
    return {
        "id": document.public_id,
        "original_filename": document.original_filename,
        "document_type_id": document.document_type.public_id if document.document_type_id else None,
        "uploaded_at": document.uploaded_at,
        "uploaded_by_role": document.uploaded_by_role,
    }


@router.get("", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    documents = db.scalars(select(Document).order_by(Document.uploaded_at.desc())).all()
    return [_document_out(d) for d in documents]


@router.post("", response_model=DocumentOut, status_code=201)
def upload_document(
    file: UploadFile, uploaded_by_role: str = "operador", db: Session = Depends(get_db)
):
    settings = get_settings()
    dest_dir = settings.storage_dir / "documents"
    dest_dir.mkdir(parents=True, exist_ok=True)

    suffix = "".join(("." + file.filename.rsplit(".", 1)[-1]) if "." in file.filename else "")
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest_path = dest_dir / stored_name
    dest_path.write_bytes(file.file.read())

    document = Document(
        original_filename=file.filename,
        storage_path=str(dest_path),
        uploaded_by_role=uploaded_by_role,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return _document_out(document)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    document = get_or_404(db, Document, document_id, "Documento no encontrado")
    return _document_out(document)


@router.get("/{document_id}/file")
def get_document_file(document_id: str, db: Session = Depends(get_db)):
    document = get_or_404(db, Document, document_id, "Documento no encontrado")
    media_type = mimetypes.guess_type(document.original_filename)[0] or "application/octet-stream"
    return FileResponse(
        document.storage_path,
        media_type=media_type,
        filename=document.original_filename,
        content_disposition_type="inline",
    )
