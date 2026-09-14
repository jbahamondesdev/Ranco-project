from app.pipeline import validation


def _field(name, data_type="texto", required=False, validation_rules=None, columns=None):
    field = {"name": name, "data_type": data_type, "required": required}
    if validation_rules is not None:
        field["validation_rules"] = validation_rules
    if columns is not None:
        field["columns"] = columns
    return field


def test_ok_when_value_present_and_confident():
    fields_schema = [_field("nombre")]
    mapped = [{"field_name": "nombre", "value": "Juan", "confidence": 0.95}]

    results, needs_review, threshold = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "ok"
    assert results[0]["reason"] is None
    assert needs_review is False
    assert threshold == 0.8


def test_missing_required_field():
    fields_schema = [_field("rut", required=True)]
    mapped = [{"field_name": "rut", "value": None, "confidence": 0.0}]

    results, needs_review, _ = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "missing"
    assert "obligatorio" in results[0]["reason"].lower()
    assert needs_review is True


def test_optional_field_missing_is_ok():
    fields_schema = [_field("observaciones", required=False)]
    mapped = [{"field_name": "observaciones", "value": None, "confidence": 0.0}]

    results, needs_review, _ = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "ok"
    assert needs_review is False


def test_low_confidence_triggers_needs_review():
    fields_schema = [_field("monto")]
    mapped = [{"field_name": "monto", "value": "100", "confidence": 0.4}]

    results, needs_review, threshold = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "needs_review"
    assert f"{threshold:.2f}" in results[0]["reason"]
    assert needs_review is True


def test_simple_field_out_of_range_is_warning_not_needs_review():
    fields_schema = [_field("edad", validation_rules=[{"type": "min", "value": "18"}])]
    mapped = [{"field_name": "edad", "value": "10", "confidence": 0.99}]

    results, needs_review, _ = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "warning"
    assert "por debajo del mínimo" in results[0]["reason"]
    # un warning de rango no fuerza revision general: el valor es confiable
    assert needs_review is False


def test_simple_field_over_max_via_workflow_threshold():
    fields_schema = [_field("cantidad")]
    mapped = [{"field_name": "cantidad", "value": "500", "confidence": 0.99}]
    field_thresholds = {"cantidad": {"max": 100}}

    results, needs_review, _ = validation.validate_mapped_fields(
        mapped, fields_schema, field_thresholds
    )

    assert results[0]["status"] == "warning"
    assert "supera el máximo" in results[0]["reason"]
    assert needs_review is False


def test_table_column_out_of_range_reports_row_and_column():
    columns = [{"name": "cantidad", "data_type": "numero"}]
    fields_schema = [_field("items", data_type="tabla", columns=columns)]
    rows = [{"cantidad": "5"}, {"cantidad": "-1"}]
    mapped = [{"field_name": "items", "value": _rows_json(rows), "confidence": 0.99}]
    field_thresholds = {"items.cantidad": {"min": 0}}

    results, needs_review, _ = validation.validate_mapped_fields(
        mapped, fields_schema, field_thresholds
    )

    assert results[0]["status"] == "warning"
    assert "fila 2" in results[0]["reason"]
    assert needs_review is False


def test_empty_table_is_ok_when_not_required():
    fields_schema = [_field("items", data_type="tabla", required=False)]
    mapped = [{"field_name": "items", "value": "[]", "confidence": 0.9}]

    results, needs_review, _ = validation.validate_mapped_fields(mapped, fields_schema)

    assert results[0]["status"] == "ok"
    assert needs_review is False


def _rows_json(rows):
    import json

    return json.dumps(rows, ensure_ascii=False)
