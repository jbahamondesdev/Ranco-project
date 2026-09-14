from datetime import datetime, timedelta, timezone

from app.models.document_type import DocumentType


def _seed(seed_execution, add_mapped_field, db_session, doc_types, *, doc_type_name, status, confidence, duration_seconds):
    doc_type = doc_types.get(doc_type_name)
    if doc_type is None:
        doc_type = DocumentType(name=doc_type_name)
        db_session.add(doc_type)
        db_session.commit()
        doc_types[doc_type_name] = doc_type

    started_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    completed_at = started_at + timedelta(seconds=duration_seconds) if duration_seconds is not None else None

    execution = seed_execution(
        document_type=doc_type, status=status, started_at=started_at, completed_at=completed_at
    )
    if confidence is not None:
        add_mapped_field(execution, value="x", confidence=confidence)
    return execution


def test_stats_empty_state(client):
    res = client.get("/executions/stats")
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "total": 0,
        "by_status": {},
        "avg_confidence": None,
        "avg_duration_seconds": None,
        "by_document_type": [],
    }


def test_stats_aggregates_by_status_and_document_type(client, db_session, seed_execution, add_mapped_field):
    doc_types: dict[str, DocumentType] = {}
    _seed(seed_execution, add_mapped_field, db_session, doc_types, doc_type_name="Factura", status="completed", confidence=0.9, duration_seconds=10)
    _seed(seed_execution, add_mapped_field, db_session, doc_types, doc_type_name="Factura", status="needs_review", confidence=0.5, duration_seconds=20)
    _seed(seed_execution, add_mapped_field, db_session, doc_types, doc_type_name="Contrato", status="completed", confidence=0.8, duration_seconds=30)

    res = client.get("/executions/stats")
    assert res.status_code == 200
    body = res.json()

    assert body["total"] == 3
    assert body["by_status"] == {"completed": 2, "needs_review": 1}
    assert body["avg_duration_seconds"] == 20  # (10+20+30)/3
    assert abs(body["avg_confidence"] - (0.9 + 0.5 + 0.8) / 3) < 1e-6

    by_type = {t["document_type_name"]: t for t in body["by_document_type"]}
    assert by_type["Factura"]["total"] == 2
    assert by_type["Contrato"]["total"] == 1
