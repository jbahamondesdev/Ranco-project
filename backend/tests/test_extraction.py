from app.pipeline.extraction import validate_and_annotate


def test_annotates_field_with_data_type():
    fields_schema = [{"name": "nombre", "data_type": "texto"}]
    mapped_fields = [{"field_name": "nombre", "value": "Juan Perez", "confidence": 0.95}]

    annotated, needs_review, threshold = validate_and_annotate(mapped_fields, fields_schema)

    assert len(annotated) == 1
    field = annotated[0]
    assert field["data_type"] == "texto"
    assert field["status"] == "ok"
    assert needs_review is False
    assert threshold == 0.8


def test_table_field_gets_tabla_data_type():
    fields_schema = [{"name": "items", "data_type": "tabla"}]
    mapped_fields = [{"field_name": "items", "value": "[]", "confidence": 0.9}]

    annotated, _, _ = validate_and_annotate(mapped_fields, fields_schema)

    assert annotated[0]["data_type"] == "tabla"


def test_missing_required_field_flags_needs_review():
    fields_schema = [{"name": "rut", "data_type": "texto", "required": True}]
    mapped_fields = [{"field_name": "rut", "value": None, "confidence": 0.0}]

    annotated, needs_review, _ = validate_and_annotate(mapped_fields, fields_schema)

    assert annotated[0]["status"] == "missing"
    assert needs_review is True


def test_field_out_of_threshold_range_is_flagged_as_warning():
    fields_schema = [{"name": "monto", "data_type": "numero"}]
    mapped_fields = [{"field_name": "monto", "value": "500", "confidence": 0.9}]
    field_thresholds = {"monto": {"min": 0, "max": 100}}

    annotated, needs_review, _ = validate_and_annotate(mapped_fields, fields_schema, field_thresholds)

    assert annotated[0]["status"] == "warning"
    assert needs_review is False  # warning no fuerza needs_review general
