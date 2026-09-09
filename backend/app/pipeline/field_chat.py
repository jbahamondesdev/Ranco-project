"""Chat con Azure OpenAI (Responses API) para configurar, de forma conversacional,
los campos a extraer de un tipo de documento a partir de un documento de referencia.
"""

import json

from app.config import get_settings
from app.pipeline.document_intelligence import AzureNotConfiguredError

FIELD_CHAT_SYSTEM_PROMPT = """Eres un asistente que ayuda a un administrador a definir, de forma \
conversacional, que campos extraer de un tipo de documento para un sistema de extraccion \
automatica. Tienes el contenido (texto y tablas) de un documento de referencia que el \
administrador subio como ejemplo.

Cuando el usuario pida extraer campos (ej: "extrae el nombre del cliente", "quiero el monto \
total y la fecha", "saca la tabla de items"):
1. Busca en el contenido del documento el valor real de cada campo pedido, como evidencia.
2. Sugiere el tipo de dato mas adecuado: "texto", "numero", "fecha", "booleano", o "tabla" si \
el campo es una tabla o lista de items repetidos.
3. Sugiere si el campo deberia ser obligatorio segun el contexto (ej: el monto total de una \
factura normalmente es obligatorio).

Si un campo es de tipo "tabla", identifica sus columnas (cada una con su propio tipo de dato) \
y entrega hasta 5 filas de ejemplo extraidas de la tabla real del documento, para que el \
usuario vea que la extraccion funciono de verdad.

Manten los campos que el usuario ya habia confirmado antes (te los paso en el contexto), a \
menos que pida explicitamente cambiarlos o quitarlos. Agrega los campos nuevos que pida. Si \
pide quitar un campo, no lo incluyas en tu respuesta.

Responde SIEMPRE con este json, sin texto fuera del json:
{
  "reply": "mensaje corto y conversacional en español explicando que hiciste",
  "fields": [
    {
      "name": "nombre_del_campo",
      "data_type": "texto|numero|fecha|booleano|tabla",
      "required": true,
      "sample_value": "valor de ejemplo encontrado en el documento, o null si es tipo tabla",
      "columns": [{"name": "...", "data_type": "texto|numero|fecha|booleano"}],
      "sample_rows": [{"columna1": "valor", "columna2": "valor"}]
    }
  ]
}
"columns" y "sample_rows" van en null salvo que data_type sea "tabla"."""


def suggest_fields(
    content_text: str,
    tables_preview: list[list[list[str]]],
    messages: list[dict],
    current_fields: list[dict],
) -> dict:
    settings = get_settings()
    if not settings.azure_openai_configured:
        raise AzureNotConfiguredError(
            "Azure OpenAI no esta configurado: define AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY "
            "y AZURE_OPENAI_DEPLOYMENT en backend/.env"
        )

    from openai import OpenAI

    client = OpenAI(base_url=settings.azure_openai_base_url, api_key=settings.azure_openai_key)

    context_message = (
        "Contenido de texto extraido del documento (puede estar truncado):\n"
        f"{content_text[:8000]}\n\n"
        "Tablas detectadas en el documento, cada una como lista de filas y cada fila como "
        f"lista de celdas (json):\n{json.dumps(tables_preview, ensure_ascii=False)[:6000]}\n\n"
        "Campos ya confirmados/editados por el usuario hasta ahora (json), respeta estos si "
        f"el usuario no pide cambiarlos:\n{json.dumps(current_fields, ensure_ascii=False)}"
    )

    input_messages = [{"role": "user", "content": context_message}]
    input_messages.extend({"role": m["role"], "content": m["content"]} for m in messages)
    input_messages.append(
        {"role": "user", "content": "Responde unicamente con el json solicitado, sin texto extra."}
    )

    response = client.responses.create(
        model=settings.azure_openai_deployment,
        instructions=FIELD_CHAT_SYSTEM_PROMPT,
        input=input_messages,
        text={"format": {"type": "json_object"}},
        temperature=0.2,
    )

    return json.loads(response.output_text)
