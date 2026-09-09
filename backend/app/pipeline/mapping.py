"""Wrapper sobre Azure OpenAI (API surface v1) para mapear el contenido extraido al esquema definido.

Requiere AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY y AZURE_OPENAI_DEPLOYMENT en backend/.env.
Usa la Responses API (client.responses.create) contra el endpoint v1 de Azure AI Foundry,
que no requiere parametro de api-version.

El mapeo usa Structured Outputs (json_schema, strict) con el schema generado a partir de
la plantilla (ver app.pipeline.json_schema), asi la forma de la respuesta queda garantizada
por el modelo en vez de validarse/reintentarse despues.
"""

import json
from dataclasses import dataclass

from app.config import get_settings
from app.pipeline.document_intelligence import AzureNotConfiguredError


@dataclass
class MappingResult:
    fields: list[dict]
    raw_response_json: str

MAPPING_SYSTEM_PROMPT = """Eres un asistente que extrae campos estructurados de texto de documentos.
Recibiras el contenido de un documento y una lista de campos a extraer, cada uno con su tipo de dato.
Para cada campo, busca su valor real en el contenido del documento y estima que tan seguro estas
del valor encontrado (confidence, 0 a 1). Si un campo es de tipo tabla, extrae todas las filas que
encuentres. Si un campo no aparece en el documento, usa value=null (o rows=[] si es tabla) y
confidence=0."""


def map_fields(content_text: str, fields_schema: list[dict], extraction_schema: dict) -> MappingResult:
    settings = get_settings()
    if not settings.azure_openai_configured:
        raise AzureNotConfiguredError(
            "Azure OpenAI no esta configurado: define AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY "
            "y AZURE_OPENAI_DEPLOYMENT en backend/.env"
        )

    from openai import OpenAI

    client = OpenAI(
        base_url=settings.azure_openai_base_url,
        api_key=settings.azure_openai_key,
    )

    user_prompt = (
        f"Campos a extraer: {json.dumps(fields_schema, ensure_ascii=False)}\n\n"
        f"Contenido del documento:\n{content_text}\n\n"
        "Responde unicamente con el json solicitado."
    )

    response = client.responses.create(
        model=settings.azure_openai_deployment,
        instructions=MAPPING_SYSTEM_PROMPT,
        input=user_prompt,
        text={
            "format": {
                "type": "json_schema",
                "name": "extracted_fields",
                "schema": extraction_schema,
                "strict": True,
            }
        },
        temperature=0,
    )

    parsed = json.loads(response.output_text)

    results = []
    for field in fields_schema:
        name = field["name"]
        entry = parsed.get(name, {})
        if field["data_type"] == "tabla":
            value = json.dumps(entry.get("rows", []), ensure_ascii=False)
        else:
            value = entry.get("value")
        results.append(
            {"field_name": name, "value": value, "confidence": entry.get("confidence", 0.0)}
        )
    return MappingResult(fields=results, raw_response_json=response.output_text)
