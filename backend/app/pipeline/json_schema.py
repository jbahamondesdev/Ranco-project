"""Convierte el fields_schema de una plantilla (DocumentTypeVersion) a un JSON Schema
estricto, compatible con Structured Outputs, para forzar la forma de la respuesta del
LLM al mapear un documento nuevo durante la ejecucion de un workflow.
"""

_SIMPLE_TYPE = {
    "texto": "string",
    "fecha": "string",
    "numero": "number",
    "booleano": "boolean",
    "porcentaje": "number",
}


def _column_property(column: dict) -> dict:
    json_type = _SIMPLE_TYPE.get(column["data_type"], "string")
    prop: dict = {"type": [json_type, "null"]}
    if column.get("description"):
        prop["description"] = column["description"]
    return prop


def _field_property(field: dict) -> dict:
    # `description`, cuando el usuario la definio (ver FieldDefinition.description), se
    # pasa tal cual como la "description" JSON Schema de la propiedad - es el mecanismo
    # estandar de Structured Outputs para dar contexto puntual por campo sin tocar el
    # prompt general (ver MAPPING_SYSTEM_PROMPT en pipeline/mapping.py).
    if field["data_type"] == "tabla":
        columns = field.get("columns") or []
        column_names = [c["name"] for c in columns]
        rows_schema: dict = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {c["name"]: _column_property(c) for c in columns},
                "required": column_names,
                "additionalProperties": False,
            },
        }
        if field.get("description"):
            rows_schema["description"] = field["description"]
        return {
            "type": "object",
            "properties": {"rows": rows_schema, "confidence": {"type": "number"}},
            "required": ["rows", "confidence"],
            "additionalProperties": False,
        }

    json_type = _SIMPLE_TYPE.get(field["data_type"], "string")
    value_schema: dict = {"type": [json_type, "null"]}
    if field.get("description"):
        value_schema["description"] = field["description"]
    return {
        "type": "object",
        "properties": {"value": value_schema, "confidence": {"type": "number"}},
        "required": ["value", "confidence"],
        "additionalProperties": False,
    }


def build_extraction_json_schema(fields_schema: list[dict]) -> dict:
    field_names = [f["name"] for f in fields_schema]
    return {
        "type": "object",
        "properties": {f["name"]: _field_property(f) for f in fields_schema},
        "required": field_names,
        "additionalProperties": False,
    }
