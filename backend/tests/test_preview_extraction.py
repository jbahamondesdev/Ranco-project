import json

from app.config import get_settings
from app.models.document import Document
from app.pipeline.document_intelligence import DocumentIntelligenceResult


def _seed_document(db_session) -> Document:
    document = Document(original_filename="doc.pdf", storage_path="/tmp/doc.pdf")
    db_session.add(document)
    db_session.commit()
    return document


def test_preview_extraction_unknown_document_is_404(client):
    res = client.post("/documents/does-not-exist/preview-extraction", json={"fields_schema": []})
    assert res.status_code == 404


def test_preview_extraction_with_no_fields_skips_azure_and_returns_empty(client, db_session):
    document = _seed_document(db_session)

    # sin mockear nada de Azure - si esto llamara a analyze_document_cached, fallaria
    # con 409 (Azure DI no configurado); que devuelva 200 confirma el corte temprano
    res = client.post(f"/documents/{document.public_id}/preview-extraction", json={"fields_schema": []})

    assert res.status_code == 200
    assert res.json() == {"fields": []}


def test_preview_extraction_without_azure_di_configured_returns_409(client, db_session):
    document = _seed_document(db_session)

    field = {"name": "nombre", "data_type": "texto", "required": False, "validation_rules": [], "columns": None}
    res = client.post(f"/documents/{document.public_id}/preview-extraction", json={"fields_schema": [field]})

    assert res.status_code == 409


def test_preview_extraction_returns_mapped_value(client, db_session, monkeypatch):
    document = _seed_document(db_session)

    content = "Cliente: Juan Perez"
    di_result = DocumentIntelligenceResult(raw_response={"content": content}, content_text=content)
    monkeypatch.setattr("app.routers.chat.analyze_document_cached", lambda path: di_result)

    settings = get_settings()
    monkeypatch.setattr(settings, "azure_openai_endpoint", "https://example.test/openai/v1")
    monkeypatch.setattr(settings, "azure_openai_key", "key")
    monkeypatch.setattr(settings, "azure_openai_deployment", "deploy")

    class _FakeResponses:
        def create(self, **kwargs):
            output = json.dumps({"nombre": {"value": "Juan Perez", "confidence": 0.92}})
            return type("FakeResponse", (), {"output_text": output})()

    class _FakeClient:
        responses = _FakeResponses()

    monkeypatch.setattr("openai.OpenAI", lambda **kw: _FakeClient())

    field = {"name": "nombre", "data_type": "texto", "required": False, "validation_rules": [], "columns": None}
    res = client.post(f"/documents/{document.public_id}/preview-extraction", json={"fields_schema": [field]})

    assert res.status_code == 200
    body = res.json()["fields"]
    assert len(body) == 1
    assert body[0]["field_name"] == "nombre"
    assert body[0]["value"] == "Juan Perez"
    assert body[0]["confidence"] == 0.92
    assert body[0]["status"] == "ok"
