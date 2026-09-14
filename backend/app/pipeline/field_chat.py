"""Chat con Azure OpenAI (Responses API) para configurar, de forma conversacional,
los campos a extraer de un tipo de documento a partir de un documento de referencia.
"""

import json

from app.config import get_settings
from app.pipeline.openai_client import get_openai_client

FIELD_CHAT_SYSTEM_PROMPT = """Eres un asistente que ayuda a un administrador a definir, de forma \
conversacional, que campos extraer de un tipo de documento para un sistema de extraccion \
automatica. Tienes el contenido (texto y tablas) de un documento de referencia que el \
administrador subio como ejemplo.

Cuando el usuario pida extraer campos (ej: "extrae el nombre del cliente", "quiero el monto \
total y la fecha", "saca la tabla de items"):
1. Busca en el contenido del documento el valor real de cada campo pedido, como evidencia.
2. Sugiere el tipo de dato mas adecuado: "texto", "numero", "fecha", "booleano", "porcentaje" si \
es un porcentaje (ej. tasa de interes, descuento, IVA), o "tabla" si el campo es una tabla o \
lista de items repetidos. Para "porcentaje", el sample_value va como numero plano en base 100 \
(ej. 15 para "15%"), nunca como fraccion (0.15) ni con el simbolo "%" incluido.
3. Sugiere si el campo deberia ser obligatorio segun el contexto (ej: el monto total de una \
factura normalmente es obligatorio).

Si un campo es de tipo "tabla", antes de definir sus columnas sigue estos pasos EN ORDEN:
1. Ubica la tabla markdown correspondiente en el documento. Mira su primera fila (encabezado) y \
su primera columna (la primera celda de cada fila siguiente).
2. Si la primera columna tiene puros rotulos/etiquetas (texto tipo "Nombre:", "Fecha:", \
"Codigo:") y las demas celdas de esas filas tienen datos distintos entre columnas (no \
repetidos), la tabla esta "transpuesta": cada COLUMNA de la tabla markdown (menos la primera) \
representa un registro distinto, no cada fila.
3. Si detectaste que esta transpuesta en el paso 2: las columnas de tu campo deben ser esos \
rotulos (uno por cada fila markdown), y debes generar una fila de salida por cada columna de \
datos de la tabla markdown (no una fila de salida por cada fila markdown de la tabla).
4. Si no esta transpuesta, procede normal: usa la primera fila markdown como nombres de columna, \
y cada fila markdown siguiente como un registro.
5. Entrega TODAS las filas resultantes que encuentres (no un resumen ni una muestra parcial), \
para que el usuario vea exactamente lo que se va a extraer despues.

Manten los campos que el usuario ya habia confirmado antes (te los paso en el contexto), a \
menos que pida explicitamente cambiarlos o quitarlos. Agrega los campos nuevos que pida. Si \
pide quitar un campo, no lo incluyas en tu respuesta.

Si el usuario da una aclaracion sobre DONDE o COMO extraer un campo (ej: "el total sacalo de \
abajo de la tabla, no de una fila", "en la informacion de pago no incluyas la URL", "ese es el \
telefono de la empresa, no el del cliente"), no la resuelvas solo en tu respuesta conversacional \
- escribela ademas como una instruccion corta y concreta en el campo "description" de ESE campo \
especifico. Esa instruccion es la que despues sigue el motor de extraccion real cada vez que se \
procese un documento de este tipo (no solo en esta conversacion), asi que tiene que quedar \
guardada ahi para que la correccion no se pierda. Si el campo no necesita una aclaracion asi, \
"description" va en null.

Responde SIEMPRE con este json, sin texto fuera del json:
{
  "reply": "mensaje corto y conversacional en español explicando que hiciste",
  "fields": [
    {
      "name": "nombre_del_campo",
      "data_type": "texto|numero|fecha|booleano|porcentaje|tabla",
      "required": true,
      "sample_value": "valor de ejemplo encontrado en el documento, o null si es tipo tabla",
      "description": "instruccion puntual de donde/como extraer este campo, o null",
      "columns": [{"name": "...", "data_type": "texto|numero|fecha|booleano|porcentaje", "description": "..."}],
      "sample_rows": [{"columna1": "valor", "columna2": "valor"}]
    }
  ]
}
"columns" y "sample_rows" van en null salvo que data_type sea "tabla"."""


def suggest_fields(
    content_text: str,
    messages: list[dict],
    current_fields: list[dict],
) -> dict:
    settings = get_settings()
    client = get_openai_client()

    # contenido completo, sin recortar - el chat de configuracion debe ver exactamente
    # lo mismo que despues va a ver el motor de mapeo real (ver mapping.py), para que
    # lo que se sugiere/prueba aca coincida con lo que pasa al procesar de verdad. Las
    # tablas ya vienen incluidas dentro de content_text como tablas markdown (ver
    # document_intelligence.clean_layout_text).
    context_message = (
        "Contenido de texto extraido del documento (completo, no es un resumen; las tablas "
        f"vienen como tablas markdown dentro del texto):\n{content_text}\n\n"
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
