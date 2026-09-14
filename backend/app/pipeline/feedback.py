"""Correcciones manuales (Revision) usadas como few-shot examples en el mapeo de
documentos del mismo tipo (ver mapping.map_fields).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_type import DocumentTypeVersion
from app.models.execution import Execution, MappedField

MAX_CORRECTION_EXAMPLES = 15


def recent_correction_examples(db: Session, document_type_id: int) -> list[dict]:
    """Correcciones manuales mas recientes de ejecuciones anteriores del mismo tipo de
    documento (cualquier version), para pasarle al mapeo como few-shot examples."""
    rows = db.execute(
        select(MappedField.field_name, MappedField.corrected_value)
        .join(Execution, MappedField.execution_id == Execution.id)
        .join(DocumentTypeVersion, Execution.document_type_version_id == DocumentTypeVersion.id)
        .where(
            DocumentTypeVersion.document_type_id == document_type_id,
            MappedField.corrected_value.isnot(None),
            MappedField.resolved == True,  # noqa: E712
        )
        .order_by(MappedField.corrected_at.desc())
        .limit(MAX_CORRECTION_EXAMPLES)
    ).all()
    return [{"field_name": row.field_name, "corrected_value": row.corrected_value} for row in rows]
