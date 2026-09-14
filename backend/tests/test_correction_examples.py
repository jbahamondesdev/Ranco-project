from app.models.document_type import DocumentType
from app.pipeline.feedback import recent_correction_examples


def test_returns_resolved_corrections_for_the_same_document_type(seed_execution, add_mapped_field, db_session):
    doc_type = DocumentType(name="Factura")
    db_session.add(doc_type)
    db_session.commit()

    execution = seed_execution(document_type=doc_type, status="completed")
    add_mapped_field(execution, field_name="nombre", status="needs_review", corrected_value="Juan Perez", resolved=True)

    examples = recent_correction_examples(db_session, doc_type.id)

    assert examples == [{"field_name": "nombre", "corrected_value": "Juan Perez"}]


def test_excludes_unresolved_and_uncorrected_fields(seed_execution, add_mapped_field, db_session):
    doc_type = DocumentType(name="Factura 2")
    db_session.add(doc_type)
    db_session.commit()

    execution_a = seed_execution(document_type=doc_type, status="completed")
    add_mapped_field(execution_a, corrected_value="Ana", resolved=False)  # sin resolver

    execution_b = seed_execution(document_type=doc_type, status="completed")
    add_mapped_field(execution_b, corrected_value=None, resolved=True)  # descartada, sin correccion

    assert recent_correction_examples(db_session, doc_type.id) == []


def test_excludes_corrections_from_other_document_types(seed_execution, add_mapped_field, db_session):
    doc_type_a = DocumentType(name="Tipo A")
    doc_type_b = DocumentType(name="Tipo B")
    db_session.add_all([doc_type_a, doc_type_b])
    db_session.commit()

    execution = seed_execution(document_type=doc_type_b, status="completed")
    add_mapped_field(execution, corrected_value="Beto", resolved=True)

    assert recent_correction_examples(db_session, doc_type_a.id) == []
