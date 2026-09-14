"""Notificaciones de salida al terminar una ejecucion - hoy solo webhook (ver
Workflow.destination / destination_config, configurado desde el editor de workflows).
"""

import logging

import httpx

from app.models.execution import Execution

logger = logging.getLogger(__name__)


def notify_execution_complete(execution: Execution) -> None:
    """Envia el resultado de la ejecucion al webhook configurado en su workflow, si
    corresponde - best-effort: un fallo aca nunca debe afectar el estado de la
    ejecucion, que ya quedo resuelto antes de llamar a esta funcion."""
    workflow = execution.workflow
    if not workflow or workflow.destination != "webhook":
        return
    url = (workflow.destination_config or {}).get("url")
    if not url:
        return

    payload = {
        "execution_id": execution.public_id,
        "workflow_id": workflow.public_id,
        "status": execution.status,
        "document_filename": execution.document.original_filename,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
        "error_message": execution.error_message,
        "mapped_fields": [
            {
                "field_name": f.field_name,
                "value": f.corrected_value or f.value,
                "confidence": f.confidence,
                "status": f.status,
            }
            for f in execution.mapped_fields
        ],
    }
    try:
        httpx.post(url, json=payload, timeout=10)
    except Exception:
        logger.warning("No se pudo enviar el webhook del workflow %s a %s", workflow.public_id, url, exc_info=True)
