import json

from app.config import get_settings


def _as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _field_range_rules(field_def: dict, field_threshold: dict | None) -> list[dict]:
    """Junta las reglas min/max del schema (legado) con el umbral definido para este
    campo (o columna de tabla) en el workflow, via el nodo Validaciones."""
    rules = [r for r in field_def.get("validation_rules", []) if r.get("type") in ("min", "max")]
    if field_threshold:
        if field_threshold.get("min") is not None:
            rules.append({"type": "min", "value": field_threshold["min"]})
        if field_threshold.get("max") is not None:
            rules.append({"type": "max", "value": field_threshold["max"]})
    return rules


def _first_violated_rule(value, validation_rules: list[dict]) -> dict | None:
    """Retorna la primera regla min/max que el valor viola, o None si respeta todas
    (o si el valor/regla no se pueden interpretar como numero, en cuyo caso se ignora
    esa regla en vez de marcar el campo como invalido por error nuestro)."""
    numeric_value = _as_float(value)
    if numeric_value is None:
        return None

    for rule in validation_rules:
        rule_value = _as_float(rule.get("value"))
        if rule_value is None:
            continue
        if rule["type"] == "min" and numeric_value < rule_value:
            return rule
        if rule["type"] == "max" and numeric_value > rule_value:
            return rule
    return None


def _range_violation_message(value, rule: dict) -> str:
    """Describe una violación de rango, direccionalmente correcta: un valor bajo un
    mínimo queda "por debajo", uno sobre un máximo "supera" (nunca al revés)."""
    if rule["type"] == "min":
        return f'{value} está por debajo del mínimo permitido ({rule["value"]})'
    return f'{value} supera el máximo permitido ({rule["value"]})'


def _table_range_violation(
    value: str, columns: list[dict], field_thresholds: dict, field_name: str
) -> str | None:
    """Revisa cada columna con umbral definido en todas las filas de la tabla.
    Retorna un mensaje explicando la primera violacion encontrada, o None si no hay."""
    try:
        rows = json.loads(value)
    except (TypeError, ValueError):
        return None
    if not isinstance(rows, list):
        return None

    for col in columns:
        col_key = f"{field_name}.{col['name']}"
        rules = _field_range_rules(col, field_thresholds.get(col_key))
        if not rules:
            continue
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            rule = _first_violated_rule(row.get(col["name"]), rules)
            if rule:
                cell_value = row.get(col["name"])
                return f'Columna "{col["name"]}" en fila {i + 1}: valor {_range_violation_message(cell_value, rule)}'
    return None


def validate_mapped_fields(
    mapped_fields: list[dict], fields_schema: list[dict], field_thresholds: dict | None = None
) -> tuple[list[dict], bool, float]:
    """Marca cada campo como ok / needs_review / missing / warning, y explica el motivo
    concreto en `reason` cuando no es "ok".

    El valor extraido SIEMPRE se guarda, sin importar el motivo — la diferencia esta en
    la severidad:
    - "missing" (obligatorio sin valor) y "needs_review" (confianza bajo el umbral fijo,
      backend/.env CONFIDENCE_THRESHOLD) son problemas de la extraccion en si, y hacen
      que toda la ejecucion quede en needs_review.
    - "warning" (el valor esta fuera de un rango min/max definido en el nodo
      Validaciones del workflow) es distinto: el modelo esta seguro del valor, solo
      no cumple una regla de negocio - se marca el campo pero NO fuerza que toda la
      ejecucion quede en needs_review.

    Retorna (campos_con_status, requiere_revision_general, umbral_usado).
    """
    settings = get_settings()
    threshold = settings.confidence_threshold
    field_thresholds = field_thresholds or {}
    schema_by_name = {f["name"]: f for f in fields_schema}
    mapped_by_name = {m["field_name"]: m for m in mapped_fields}

    results = []
    needs_review = False

    for name, field_def in schema_by_name.items():
        mapped = mapped_by_name.get(name)
        value = mapped.get("value") if mapped else None
        confidence = mapped.get("confidence") if mapped else 0.0
        is_table = field_def.get("data_type") == "tabla"
        empty_values = (None, "", "[]") if is_table else (None, "")
        reason: str | None = None

        if value in empty_values:
            if field_def.get("required"):
                status = "missing"
                reason = "Campo obligatorio sin valor extraído"
            else:
                status = "ok"
        elif confidence is not None and confidence < threshold:
            status = "needs_review"
            reason = f"Confianza baja: {confidence:.2f} (mínimo {threshold:.2f})"
        elif is_table:
            columns = field_def.get("columns") or []
            table_reason = _table_range_violation(value, columns, field_thresholds, name)
            status = "warning" if table_reason else "ok"
            reason = table_reason
        else:
            rule = _first_violated_rule(value, _field_range_rules(field_def, field_thresholds.get(name)))
            if rule:
                status = "warning"
                reason = f"Valor {_range_violation_message(value, rule)}"
            else:
                status = "ok"

        # "warning" (fuera de rango) no cuenta como needs_review general: el valor es
        # confiable, solo necesita una revisión de negocio, no de la extracción.
        if status in ("missing", "needs_review"):
            needs_review = True

        results.append(
            {
                "field_name": name,
                "value": value,
                "confidence": confidence,
                "status": status,
                "reason": reason,
            }
        )

    return results, needs_review, threshold
