import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, get_db, get_or_404, paginate
from app.models.document import Document
from app.schemas.document import DocumentOut

router = APIRouter(prefix="/documents", tags=["documents"])

_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MiB, tamaño de lectura al volcar el archivo a disco


def _document_out(document: Document) -> dict:
    return {
        "id": document.public_id,
        "original_filename": document.original_filename,
        "document_type_id": document.document_type.public_id if document.document_type_id else None,
        "uploaded_at": document.uploaded_at,
        "uploaded_by_role": document.uploaded_by_role,
    }


@router.get("", response_model=list[DocumentOut])
def list_documents(
    limit: int = Query(DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(Document).order_by(Document.uploaded_at.desc())
    documents = db.scalars(paginate(query, limit, offset)).all()
    return [_document_out(d) for d in documents]


@router.post("", response_model=DocumentOut, status_code=201)
def upload_document(
    file: UploadFile, uploaded_by_role: str = "operador", db: Session = Depends(get_db)
):
    settings = get_settings()

    if not file.filename:
        raise HTTPException(400, "El archivo no tiene nombre")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in settings.allowed_upload_extensions:
        allowed = ", ".join(sorted(settings.allowed_upload_extensions))
        raise HTTPException(
            415,
            f"Extensión no soportada ({suffix or 'sin extensión'}). Extensiones permitidas: {allowed}",
        )

    dest_dir = settings.storage_dir / "documents"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest_path = dest_dir / stored_name

    max_bytes = settings.max_upload_mb * 1024 * 1024
    try:
        written = 0
        with dest_path.open("wb") as out:
            while chunk := file.file.read(_UPLOAD_CHUNK_SIZE):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        413, f"El archivo supera el tamaño máximo permitido ({settings.max_upload_mb} MB)"
                    )
                out.write(chunk)
    except HTTPException:
        dest_path.unlink(missing_ok=True)
        raise

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
