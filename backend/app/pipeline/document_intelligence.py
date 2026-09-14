"""Wrapper sobre Azure Document Intelligence.

Requiere AZURE_DI_ENDPOINT y AZURE_DI_KEY configurados en backend/.env.
Si no estan configurados, se lanza AzureNotConfiguredError con un mensaje
claro en vez de fallar con un stacktrace generico del SDK.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from app.config import get_settings


class AzureNotConfiguredError(RuntimeError):
    pass


@dataclass
class DocumentIntelligenceResult:
    raw_response: dict
    # texto plano unico listo para el LLM (ver clean_layout_text) - no es el "content"
    # crudo de Azure DI: ya viene sin headers/footers/notas al pie y con las tablas
    # insertadas como markdown en vez de celdas sueltas desordenadas.
    content_text: str


def analyze_document(file_path: str) -> DocumentIntelligenceResult:
    settings = get_settings()
    if not settings.azure_di_configured:
        raise AzureNotConfiguredError(
            "Azure Document Intelligence no esta configurado: define AZURE_DI_ENDPOINT "
            "y AZURE_DI_KEY en backend/.env"
        )

    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.core.credentials import AzureKeyCredential

    client = DocumentIntelligenceClient(
        endpoint=settings.azure_di_endpoint,
        credential=AzureKeyCredential(settings.azure_di_key),
    )

    with open(file_path, "rb") as f:
        poller = client.begin_analyze_document(
            "prebuilt-layout", body=f, content_type="application/octet-stream"
        )
    result = poller.result()
    raw = result.as_dict()
    content_text = clean_layout_text(raw)

    return DocumentIntelligenceResult(raw_response=raw, content_text=content_text)


def _cache_path(file_path: str) -> Path:
    return Path(file_path).with_suffix(Path(file_path).suffix + ".di.json")


def analyze_document_cached(file_path: str) -> DocumentIntelligenceResult:
    """Igual que analyze_document, pero reutiliza el resultado si ya se analizo antes
    este mismo archivo (evita reprocesar en cada mensaje del chat de configuracion)."""
    cache_file = _cache_path(file_path)
    if cache_file.exists():
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        return DocumentIntelligenceResult(**data)

    result = analyze_document(file_path)
    cache_file.write_text(json.dumps(asdict(result), ensure_ascii=False), encoding="utf-8")
    return result


_EXCLUDED_PARAGRAPH_ROLES = {"pageHeader", "pageFooter", "footnote"}


def _table_to_markdown(table: dict) -> str:
    row_count = table.get("rowCount", 0)
    col_count = table.get("columnCount", 0)
    if row_count == 0 or col_count == 0:
        return ""

    grid = [["" for _ in range(col_count)] for _ in range(row_count)]
    for cell in table.get("cells", []):
        r, c = cell.get("rowIndex", 0), cell.get("columnIndex", 0)
        if r < row_count and c < col_count:
            # escapa "|" (rompería las columnas markdown) y saltos de linea internos
            grid[r][c] = (cell.get("content") or "").strip().replace("|", "\\|").replace("\n", " ")

    header = "| " + " | ".join(grid[0]) + " |"
    divider = "| " + " | ".join("---" for _ in range(col_count)) + " |"
    rows = ["| " + " | ".join(row) + " |" for row in grid[1:]]
    return "\n".join([header, divider, *rows])


def _table_index_by_span(tables: list[dict]) -> dict[tuple[int, int], int]:
    """Rango de offset de cada celda -> indice de su tabla en `tables`, para poder
    reconocer que parrafos pertenecen a una tabla y saltarlos (se reemplazan por la
    tabla completa en markdown, ver clean_layout_text)."""
    index: dict[tuple[int, int], int] = {}
    for i, table in enumerate(tables):
        for cell in table.get("cells", []):
            for span in cell.get("spans") or []:
                offset = span.get("offset", 0)
                index[(offset, offset + span.get("length", 0))] = i
    return index


def _table_index_for_offset(offset: int, span_index: dict[tuple[int, int], int]) -> int | None:
    for (start, end), i in span_index.items():
        if start <= offset < end:
            return i
    return None


def clean_layout_text(raw_response: dict) -> str:
    """Construye el unico texto plano que se le pasa al LLM a partir de la respuesta de
    Azure Document Intelligence (prebuilt-layout):

    - el cuerpo se arma recorriendo "paragraphs" en su orden original (no "content",
      que concatena todo sin distinguir que es encabezado/pie/nota);
    - se excluyen los parrafos con role "pageHeader", "pageFooter" o "footnote" -
      contenido repetitivo entre paginas o irrelevante para extraer campos;
    - las tablas se insertan como tablas markdown (a partir de rowIndex/columnIndex de
      cada celda), una vez por tabla, en el lugar donde aparecen - en vez del texto
      celda-por-celda desordenado que traen "paragraphs"/"content" para una tabla.

    Pura y testeable: recibe el JSON crudo, devuelve un string. Si el JSON no trae
    "paragraphs" (respuesta incompleta/de prueba), cae de vuelta al "content" crudo en
    vez de devolver un string vacio.
    """
    paragraphs = raw_response.get("paragraphs") or []
    if not paragraphs:
        return raw_response.get("content", "")

    tables = raw_response.get("tables") or []
    span_index = _table_index_by_span(tables)

    parts: list[str] = []
    inserted_tables: set[int] = set()

    for paragraph in paragraphs:
        if paragraph.get("role") in _EXCLUDED_PARAGRAPH_ROLES:
            continue

        spans = paragraph.get("spans") or []
        offset = spans[0].get("offset", 0) if spans else None
        table_index = _table_index_for_offset(offset, span_index) if offset is not None else None

        if table_index is not None:
            if table_index not in inserted_tables:
                inserted_tables.add(table_index)
                markdown = _table_to_markdown(tables[table_index])
                if markdown:
                    parts.append(markdown)
            continue

        content = (paragraph.get("content") or "").strip()
        if content:
            parts.append(content)

    # tablas que ningun parrafo referencio (caso raro) - igual se incluyen, al final
    for i, table in enumerate(tables):
        if i not in inserted_tables:
            markdown = _table_to_markdown(table)
            if markdown:
                parts.append(markdown)

    return "\n\n".join(parts)
