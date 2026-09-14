from app.db import DEFAULT_LIST_LIMIT
from app.models.document_type import DocumentType


def test_list_document_types_is_capped_by_default_limit(client, db_session):
    for i in range(DEFAULT_LIST_LIMIT + 5):
        db_session.add(DocumentType(name=f"Tipo {i}"))
    db_session.commit()

    res = client.get("/document-types")

    assert res.status_code == 200
    assert len(res.json()) == DEFAULT_LIST_LIMIT


def test_list_document_types_respects_limit_and_offset(client, db_session):
    for i in range(10):
        db_session.add(DocumentType(name=f"Tipo {i}"))
    db_session.commit()

    res = client.get("/document-types", params={"limit": 3, "offset": 2})

    assert res.status_code == 200
    assert len(res.json()) == 3


def test_list_document_types_rejects_limit_above_max(client):
    res = client.get("/document-types", params={"limit": 10_000})
    assert res.status_code == 422
