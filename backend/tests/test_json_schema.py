from app.pipeline.json_schema import build_extraction_json_schema


def test_simple_fields_by_data_type():
    fields_schema = [
        {"name": "nombre", "data_type": "texto"},
        {"name": "monto", "data_type": "numero"},
        {"name": "vigente", "data_type": "booleano"},
        {"name": "fecha", "data_type": "fecha"},
    ]

    schema = build_extraction_json_schema(fields_schema)

    assert schema["required"] == ["nombre", "monto", "vigente", "fecha"]
    assert schema["additionalProperties"] is False
    assert schema["properties"]["nombre"]["properties"]["value"]["type"] == ["string", "null"]
    assert schema["properties"]["monto"]["properties"]["value"]["type"] == ["number", "null"]
    assert schema["properties"]["vigente"]["properties"]["value"]["type"] == ["boolean", "null"]
    # cada campo simple exige value + confidence, sin propiedades extra
    assert set(schema["properties"]["nombre"]["required"]) == {"value", "confidence"}


def test_table_field_uses_rows_with_required_columns():
    fields_schema = [
        {
            "name": "items",
            "data_type": "tabla",
            "columns": [
                {"name": "producto", "data_type": "texto"},
                {"name": "cantidad", "data_type": "numero"},
            ],
        }
    ]

    schema = build_extraction_json_schema(fields_schema)
    items_schema = schema["properties"]["items"]

    assert items_schema["required"] == ["rows", "confidence"]
    row_schema = items_schema["properties"]["rows"]["items"]
    assert row_schema["required"] == ["producto", "cantidad"]
    assert row_schema["properties"]["cantidad"]["type"] == ["number", "null"]
    assert row_schema["additionalProperties"] is False


def test_porcentaje_field_uses_number_type():
    fields_schema = [{"name": "descuento", "data_type": "porcentaje"}]

    schema = build_extraction_json_schema(fields_schema)

    assert schema["properties"]["descuento"]["properties"]["value"]["type"] == ["number", "null"]


def test_unknown_data_type_falls_back_to_string():
    fields_schema = [{"name": "raro", "data_type": "lo-que-sea"}]

    schema = build_extraction_json_schema(fields_schema)

    assert schema["properties"]["raro"]["properties"]["value"]["type"] == ["string", "null"]


def test_field_description_becomes_json_schema_description():
    # la "description" que el usuario define para un campo (ver FieldDefinition) viaja
    # tal cual como la "description" JSON Schema de esa propiedad - es el mecanismo que
    # Structured Outputs lee para dar contexto puntual sin tocar el prompt general
    fields_schema = [
        {"name": "total_factura", "data_type": "numero", "description": "Tomar el TOTAL fuera de la tabla de items"}
    ]

    schema = build_extraction_json_schema(fields_schema)

    assert (
        schema["properties"]["total_factura"]["properties"]["value"]["description"]
        == "Tomar el TOTAL fuera de la tabla de items"
    )


def test_field_without_description_omits_the_json_schema_key():
    fields_schema = [{"name": "nombre", "data_type": "texto"}]

    schema = build_extraction_json_schema(fields_schema)

    assert "description" not in schema["properties"]["nombre"]["properties"]["value"]


def test_table_and_column_description_become_json_schema_description():
    fields_schema = [
        {
            "name": "items",
            "data_type": "tabla",
            "description": "Solo los items facturados, no los devueltos",
            "columns": [
                {"name": "producto", "data_type": "texto"},
                {"name": "total", "data_type": "numero", "description": "Subtotal de la fila, no el total general"},
            ],
        }
    ]

    schema = build_extraction_json_schema(fields_schema)
    items_schema = schema["properties"]["items"]

    assert items_schema["properties"]["rows"]["description"] == "Solo los items facturados, no los devueltos"
    row_columns = items_schema["properties"]["rows"]["items"]["properties"]
    assert row_columns["total"]["description"] == "Subtotal de la fila, no el total general"
    assert "description" not in row_columns["producto"]
