"""Tramo compartido "validar -> etiquetar con data_type" que corre despues de mapear un
documento con `mapping.map_fields`. Lo usan tanto `orchestrator.run_execution` (al
procesar un documento de verdad) como el endpoint de vista previa de configuracion
de tipos (`routers/chat.py::preview_extraction`), para que ambos corran exactamente
la misma logica de post-procesamiento sobre el resultado del mapeo.
"""

from app.pipeline import validation


def validate_and_annotate(
    mapped_fields: list[dict],
    fields_schema: list[dict],
    field_thresholds: dict | None = None,
) -> tuple[list[dict], bool, float]:
    """Devuelve (campos_anotados, requiere_revision_general, umbral_usado). Cada
    campo anotado trae ademas su "data_type" (para que el frontend sepa como
    renderizarlo, ej. tabla vs texto)."""
    validated, needs_review, threshold_used = validation.validate_mapped_fields(
        mapped_fields, fields_schema, field_thresholds or {}
    )

    data_type_by_name = {f["name"]: f.get("data_type", "texto") for f in fields_schema}
    annotated = [
        {**field, "data_type": data_type_by_name.get(field["field_name"], "texto")} for field in validated
    ]

    return annotated, needs_review, threshold_used
