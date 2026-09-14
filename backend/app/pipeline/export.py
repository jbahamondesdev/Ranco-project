"""Arma las filas CSV para los endpoints de exportacion de ejecuciones
(backend/app/routers/executions.py) - la respuesta HTTP (StreamingResponse, headers)
se arma en el router, esto solo produce los datos.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import MAX_LIST_LIMIT
from app.models.execution import Execution


def fetch_executions_for_export(
    db: Session, *, workflow_id: int | None = None, status: str | None = None
) -> list[Execution]:
    query = select(Execution).options(
        selectinload(Execution.mapped_fields), selectinload(Execution.document)
    )
    if workflow_id is not None:
        query = query.where(Execution.workflow_id == workflow_id)
    if status:
        query = query.where(Execution.status == status)
    query = query.order_by(Execution.started_at.desc()).limit(MAX_LIST_LIMIT)
    return list(db.scalars(query).all())


def execution_fields_csv_rows(execution: Execution) -> list[list]:
    rows = [["campo", "valor", "valor_corregido", "confianza", "estado"]]
    for field in execution.mapped_fields:
        rows.append(
            [
                field.field_name,
                field.value or "",
                field.corrected_value or "",
                field.confidence if field.confidence is not None else "",
                field.status,
            ]
        )
    return rows


def executions_summary_csv_rows(executions: list[Execution]) -> list[list]:
    """Una fila por ejecucion, una columna por campo mapeado (union de los nombres de
    campo vistos - normalmente estable porque todas comparten el mismo tipo de
    documento cuando se filtra por workflow)."""
    field_names: list[str] = []
    seen_fields: set[str] = set()
    values_by_execution: list[dict[str, str]] = []

    for execution in executions:
        values_by_field: dict[str, str] = {}
        for field in execution.mapped_fields:
            if field.field_name not in seen_fields:
                seen_fields.add(field.field_name)
                field_names.append(field.field_name)
            values_by_field[field.field_name] = field.corrected_value or field.value or ""
        values_by_execution.append(values_by_field)

    rows = [["ejecucion", "documento", "estado", "inicio", *field_names]]
    for execution, values_by_field in zip(executions, values_by_execution):
        rows.append(
            [
                execution.public_id,
                execution.document.original_filename,
                execution.status,
                execution.started_at.isoformat(),
                *[values_by_field.get(name, "") for name in field_names],
            ]
        )
    return rows
