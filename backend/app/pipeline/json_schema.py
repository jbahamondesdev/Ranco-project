"""Convierte el fields_schema de una plantilla (DocumentTypeVersion) a un JSON Schema
estricto, compatible con Structured Outputs, para forzar la forma de la respuesta del
LLM al mapear un documento nuevo durante la ejecucion de un workflow.
"""

_SIMPLE_TYPE = {
    "texto": "string",
    "fecha": "string",
    "numero": "number",
    "booleano": "boolean",
}


def _column_property(column: dict) -> dict:
    json_type = _SIMPLE_TYPE.get(column["data_type"], "string")
    return {"type": [json_type, "null"]}


def _field_property(field: dict) -> dict:
    if field["data_type"] == "tabla":
        columns = field.get("columns") or []
        column_names = [c["name"] for c in columns]
        return {
            "type": "object",
            "properties": {
                "rows": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {c["name"]: _column_property(c) for c in columns},
                        "required": column_names,
                        "additionalProperties": False,
                    },
                },
                "confidence": {"type": "number"},
            },
            "required": ["rows", "confidence"],
            "additionalProperties": False,
        }

    json_type = _SIMPLE_TYPE.get(field["data_type"], "string")
    return {
        "type": "object",
        "properties": {
            "value": {"type": [json_type, "null"]},
            "confidence": {"type": "number"},
        },
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
