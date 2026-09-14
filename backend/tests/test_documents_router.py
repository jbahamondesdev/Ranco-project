import io

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_storage(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    yield settings


def test_upload_document_success(client):
    res = client.post(
        "/documents",
        files={"file": ("factura.pdf", io.BytesIO(b"%PDF-1.4 contenido de prueba"), "application/pdf")},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["original_filename"] == "factura.pdf"


def test_upload_document_rejects_disallowed_extension(client, _isolated_storage):
    res = client.post(
        "/documents",
        files={"file": ("script.exe", io.BytesIO(b"MZ..."), "application/octet-stream")},
    )
    assert res.status_code == 415
    assert list((_isolated_storage.storage_dir / "documents").glob("*")) == []


def test_upload_document_rejects_oversized_file(client, _isolated_storage, monkeypatch):
    monkeypatch.setattr(_isolated_storage, "max_upload_mb", 1)
    oversized = io.BytesIO(b"a" * (2 * 1024 * 1024))

    res = client.post(
        "/documents",
        files={"file": ("grande.pdf", oversized, "application/pdf")},
    )
    assert res.status_code == 413
    # no debe quedar un archivo parcial en disco
    assert list((_isolated_storage.storage_dir / "documents").glob("*")) == []
