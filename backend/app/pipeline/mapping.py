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
from app.pipeline.openai_client import get_openai_client


@dataclass
class MappingResult:
    fields: list[dict]
    raw_response_json: str

MAPPING_SYSTEM_PROMPT = """Eres un asistente que extrae campos estructurados desde el texto de un
documento. Recibiras el contenido de un documento y una lista de campos a extraer, cada uno con
su nombre y tipo de dato (y, opcionalmente, una "description" con una instruccion especifica para
ese campo puntual). Para cada campo, busca su valor real en el documento y estima que tan seguro
estas del valor encontrado (confidence, de 0 a 1).

Reglas generales, para cualquier documento:
- Nunca inventes un valor que no este en el documento: si un campo no aparece, usa value=null (o
  rows=[] si es de tipo tabla) y confidence=0.
- Si hay mas de un valor candidato para un campo (ej. varias fechas o montos en el documento),
  prefiere el que este mas cerca de una etiqueta o rotulo que calce con el nombre del campo
  pedido; si de verdad es ambiguo cual es el correcto, elige tu mejor candidato pero baja la
  confianza en vez de adivinar con confianza alta.
- Copia los valores tal cual aparecen escritos en el documento - mismo formato, mismos
  separadores, sin traducir ni reescribir fechas o montos a otro formato, y sin combinar texto de
  mas de un lugar del documento en un solo valor - salvo que el campo pedido sea explicitamente
  el texto completo de una seccion.
- Si un campo trae su propia "description", esa instruccion tiene prioridad sobre cualquier regla
  general de este mensaje, solo para ese campo.
- Si un campo es de tipo "porcentaje", devuelve siempre el numero plano en base 100 (ej. 15 para
  "15%"), nunca como fraccion (0.15) ni con el simbolo "%" incluido.

Tablas:
- Las tablas del documento vienen incluidas dentro del contenido como tablas markdown (filas con
  "|" y una fila separadora "---"). Usa la tabla markdown correspondiente como fuente de las filas
  de un campo tipo tabla - es mas confiable que reconstruir filas y columnas desde texto plano sin
  esa estructura.
- Algunas tablas vienen "transpuestas": en vez de tener un encabezado de columna arriba y un
  registro por fila, tienen una etiqueta en su primera columna (ej. "Nombre:", "Fecha:",
  "Codigo:") y los valores de cada registro repartidos en las columnas siguientes, una columna
  por registro en vez de una fila (ej. una columna por persona, por producto o por sucursal
  distinta). Si las columnas que pide el campo son atributos de un registro pero la tabla
  markdown viene en esa orientacion, transponla mentalmente: cada columna de valores de la tabla
  markdown pasa a ser una fila de salida, repitiendo un mismo valor en varias filas si ese
  atributo es compartido por todos los registros. No copies la orientacion visual literal si no
  calza con las columnas pedidas."""


def map_fields(
    content_text: str,
    fields_schema: list[dict],
    extraction_schema: dict,
    examples: list[dict] | None = None,
) -> MappingResult:
    settings = get_settings()
    client = get_openai_client()

    # correcciones manuales previas de este mismo tipo de documento (ver
    # orchestrator._recent_correction_examples) - le dan al modelo una guia concreta de
    # como se interpretan/formatean los valores en documentos parecidos, sin forzarlo a
    # repetirlas si el valor real de este documento es distinto
    examples_block = ""
    if examples:
        examples_block = (
            "Correcciones manuales hechas por un humano en documentos anteriores de este "
            "mismo tipo (usalas como guia de formato e interpretacion, no las copies "
            f"literalmente si el valor de este documento es distinto):\n"
            f"{json.dumps(examples, ensure_ascii=False)}\n\n"
        )

    user_prompt = (
        f"Campos a extraer: {json.dumps(fields_schema, ensure_ascii=False)}\n\n"
        f"{examples_block}"
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
            value = _stringify(entry.get("value"))
            if field["data_type"] == "porcentaje":
                value = _normalize_percentage(value)
        results.append(
            {"field_name": name, "value": value, "confidence": entry.get("confidence", 0.0)}
        )
    return MappingResult(fields=results, raw_response_json=response.output_text)


def _stringify(value: object) -> str | None:
    """MappedField.value se guarda siempre como texto (columna Text) - pero para
    campos "numero"/"booleano" el schema estricto hace que el modelo devuelva un
    numero/booleano real de JSON, no un string. Sin esto, cualquier consumidor que
    espere un str (validacion de rango, exportacion CSV) se rompe con un TypeError
    apenas el campo tiene un valor no-string."""
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def _normalize_percentage(value: str | None) -> str | None:
    """MAPPING_SYSTEM_PROMPT le pide al modelo devolver "porcentaje" como numero plano
    en base 100 (15 para "15%"), pero un LLM no sigue una instruccion de prompt con
    garantia total - si igual devuelve la fraccion (0.15), se corrige aca en vez de
    dejar que se guarde inconsistente (mismo motivo que _stringify: el contrato del
    pipeline se garantiza en codigo, no solo en texto de instrucciones)."""
    if value is None:
        return value
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    if -1 <= number <= 1:
        number *= 100
    return str(int(number)) if number == int(number) else str(number)
