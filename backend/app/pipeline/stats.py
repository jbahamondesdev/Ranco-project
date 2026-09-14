"""Agregados sobre el historial de ejecuciones, para el dashboard (GET /executions/stats)."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.document_type import DocumentTypeVersion
from app.models.execution import Execution, MappedField

# estados de MappedField que representan "algo que vale la pena que alguien revise":
# confianza baja, obligatorio ausente, o fuera de un umbral min/max definido
ISSUE_STATUSES = ("needs_review", "missing", "warning")

# tope de filas consideradas para /stats - a esta escala (MVP local) calcular en
# Python evita SQL de fecha/promedio especifico de cada dialecto (SQLite en tests,
# SQL Server en produccion); mas alla de este tope las metricas quedan aproximadas.
_STATS_MAX_ROWS = 5000


def has_unresolved_issues(fields: list[MappedField]) -> bool:
    return any(f.status in ISSUE_STATUSES and not f.resolved for f in fields)


def compute_execution_stats(db: Session) -> dict:
    executions = db.scalars(
        select(Execution)
        .options(
            selectinload(Execution.mapped_fields),
            selectinload(Execution.document_type_version).selectinload(DocumentTypeVersion.document_type),
        )
        .order_by(Execution.started_at.desc())
        .limit(_STATS_MAX_ROWS)
    ).all()

    by_status: dict[str, int] = {}
    durations: list[float] = []
    confidences: list[float] = []
    by_type: dict[int, dict] = {}

    for execution in executions:
        by_status[execution.status] = by_status.get(execution.status, 0) + 1
        if execution.completed_at is not None:
            durations.append((execution.completed_at - execution.started_at).total_seconds())

        field_confidences = [f.confidence for f in execution.mapped_fields if f.confidence is not None]
        confidences.extend(field_confidences)

        doc_type = execution.document_type_version.document_type
        entry = by_type.setdefault(
            doc_type.id,
            {
                "document_type_id": doc_type.public_id,
                "document_type_name": doc_type.name,
                "total": 0,
                "needs_review": 0,
                "confidences": [],
            },
        )
        entry["total"] += 1
        if has_unresolved_issues(execution.mapped_fields):
            entry["needs_review"] += 1
        entry["confidences"].extend(field_confidences)

    by_document_type = [
        {
            "document_type_id": v["document_type_id"],
            "document_type_name": v["document_type_name"],
            "total": v["total"],
            "needs_review": v["needs_review"],
            "avg_confidence": sum(v["confidences"]) / len(v["confidences"]) if v["confidences"] else None,
        }
        for v in sorted(by_type.values(), key=lambda v: v["total"], reverse=True)
    ]

    return {
        "total": len(executions),
        "by_status": by_status,
        "avg_confidence": sum(confidences) / len(confidences) if confidences else None,
        "avg_duration_seconds": sum(durations) / len(durations) if durations else None,
        "by_document_type": by_document_type,
    }
