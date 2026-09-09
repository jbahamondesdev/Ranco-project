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
    content_text = raw.get("content", "")

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


def extract_tables_preview(raw_response: dict, max_rows: int = 12) -> list[list[list[str]]]:
    """Convierte las tablas detectadas por Azure DI en listas simples de filas de texto,
    listas para mandarle al LLM como contexto (sin todo el ruido de bounding boxes, etc.)."""
    tables_preview: list[list[list[str]]] = []
    for table in raw_response.get("tables", []):
        row_count = table.get("rowCount", 0)
        col_count = table.get("columnCount", 0)
        if row_count == 0 or col_count == 0:
            continue
        grid = [["" for _ in range(col_count)] for _ in range(row_count)]
        for cell in table.get("cells", []):
            r, c = cell.get("rowIndex", 0), cell.get("columnIndex", 0)
            if r < row_count and c < col_count:
                grid[r][c] = (cell.get("content") or "").strip()
        tables_preview.append(grid[:max_rows])
    return tables_preview
