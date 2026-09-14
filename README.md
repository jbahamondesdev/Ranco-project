# Plataforma de extracción y mapeo de documentos (MVP local)

## Estructura

- `backend/` — API FastAPI (Python, gestionado con [`uv`](https://docs.astral.sh/uv/)). Orquesta ingesta, extracción (Azure Document Intelligence), mapeo (Azure OpenAI) y validación. Persiste en SQL Server Express.
- `frontend/` — Configuración de tipos de documento asistida por chat con IA, y UI de procesamiento/monitoreo/revisión (React + Vite + TypeScript).

## Requisitos

- Python 3.13+, con [`uv`](https://docs.astral.sh/uv/) instalado (`pip install uv`).
- Node.js 20+ con `npm`.
- SQL Server Express local, con autenticación Windows (Trusted Connection) y el driver **ODBC Driver 18 for SQL Server** instalado.
- Credenciales de Azure Document Intelligence y Azure OpenAI (Foundry) — opcional para levantar la app, pero necesarias para que el pipeline procese documentos de verdad.

## Backend

```bash
cd backend
uv sync                          # instala dependencias en .venv
cp .env.example .env             # completa AZURE_DI_*, AZURE_OPENAI_* con tus credenciales
uv run alembic upgrade head      # crea la base RancoDocExtract (si no existe) y las tablas
uv run uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` (`/health` para verificar la conexión a SQL Server). No hay datos de ejemplo precargados: crea el primer tipo de documento desde la UI (`/tipos-documento/nuevo`).

Para borrar todos los datos y archivos y dejar la app en estado limpio: `uv run python -m app.scripts.reset_data`.

### Variables de entorno (`backend/.env`)

| Variable | Descripción |
|---|---|
| `SQL_SERVER_INSTANCE` | Instancia de SQL Server Express (default `OMIKRON\SQLEXPRESS`) |
| `SQL_DATABASE` | Nombre de la base (default `RancoDocExtract`) |
| `AZURE_DI_ENDPOINT` / `AZURE_DI_KEY` | Credenciales de Azure Document Intelligence |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_KEY` / `AZURE_OPENAI_DEPLOYMENT` | Credenciales de Azure OpenAI (Foundry). El endpoint es la URL v1 completa (`.../openai/v1/responses` o `.../openai/v1`) — el mapeo usa la Responses API, que no requiere `api-version`. |
| `CONFIDENCE_THRESHOLD` | Umbral de confianza bajo el cual un campo pasa a revisión (default `0.8`) |

Si `AZURE_DI_*` o `AZURE_OPENAI_*` están vacíos, cualquier ejecución del pipeline (o el chat de configuración de tipos) termina con un mensaje explícito indicando qué configurar — el resto de la app funciona igual.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

La app queda en `http://localhost:5173` y espera el backend en `http://localhost:8000` (configurable con `VITE_API_URL`).

## Flujo de prueba end-to-end

La página de inicio (`/`) explica los 3 pasos con contadores en vivo. En resumen:

1. **Configurar tipos** → crea uno nuevo desde `/tipos-documento/nuevo`: sube un documento de referencia a la izquierda y chatea con el asistente a la derecha para definir los campos (incluye tablas) — revisa/edita tipo de dato y obligatoriedad, guarda y publica.
2. **Procesar documento** → sube un archivo, elige el tipo que acabas de publicar y presiona "Procesar documento". Ahí mismo se ve el avance del pipeline (Ingesta → Extracción → Mapeo → Validación → Resultado).
3. **Seguimiento** → historial completo de ejecuciones, con el mismo avance visual y el detalle técnico de cada etapa.
4. **Revisión** → si algún campo queda con baja confianza o falta uno obligatorio, aparece acá para corregirlo manualmente.

El rol activo (arriba a la derecha, sin login) controla qué secciones del menú se ven.

## Alcance de este scaffold

Implementado de punta a punta: configuración de tipos de documento asistida por chat con IA (con preview del documento, extracción de tablas y confirmación manual de tipo de dato/obligatoriedad), versionado, publicación, carga y clasificación manual de documentos, pipeline con reintentos y trazabilidad, monitoreo con historial de eventos, y cola de revisión por baja confianza.

Modelado pero no implementado en esta pasada (ver `PRD.md` §12): autenticación real, alertas/notificaciones por canal externo, clasificación automática de tipo de documento, configuración avanzada de formato de salida, cola de procesamiento dedicada (Celery/Redis).
