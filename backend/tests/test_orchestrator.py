import pytest

from app.config import get_settings
from app.models.workflow import Workflow
from app.pipeline import orchestrator
from app.pipeline.document_intelligence import AzureNotConfiguredError


def test_safe_error_message_strips_absolute_paths():
    exc = Exception(
        r"No se pudo leer C:\Users\jorge\Projects\Proyecto-Ranco\backend\storage\documents\secret.pdf: fail"
    )
    message = orchestrator._safe_error_message(exc)
    assert "C:\\Users" not in message
    assert "[ruta omitida]" in message


def test_safe_error_message_truncates_long_messages():
    exc = Exception("x" * 1000)
    message = orchestrator._safe_error_message(exc)
    assert len(message) <= orchestrator._MAX_ERROR_MESSAGE_LENGTH + 1  # +1 por el "…" final
    assert message.endswith("…")


def test_safe_error_message_falls_back_to_class_name_when_empty():
    message = orchestrator._safe_error_message(RuntimeError())
    assert message == "RuntimeError"


def test_run_with_retry_waits_with_linear_backoff(seed_execution, db_session, monkeypatch):
    execution = seed_execution()
    sleeps: list[float] = []
    monkeypatch.setattr(orchestrator.time, "sleep", lambda seconds: sleeps.append(seconds))

    calls = {"count": 0}

    def flaky():
        calls["count"] += 1
        if calls["count"] < 3:
            raise RuntimeError("fallo transitorio")
        return "ok"

    result = orchestrator._run_with_retry(db_session, execution, "extraction", flaky)

    assert result == "ok"
    assert calls["count"] == 3
    backoff = get_settings().retry_backoff_seconds
    assert sleeps == [backoff * 1, backoff * 2]


def test_run_with_retry_raises_after_exhausting_retries(seed_execution, db_session, monkeypatch):
    execution = seed_execution()
    sleeps: list[float] = []
    monkeypatch.setattr(orchestrator.time, "sleep", lambda seconds: sleeps.append(seconds))

    def always_fails():
        raise RuntimeError("siempre falla")

    with pytest.raises(RuntimeError, match="siempre falla"):
        orchestrator._run_with_retry(db_session, execution, "extraction", always_fails)

    # MAX_RETRIES=2 -> 3 intentos totales, un sleep entre cada par de intentos, ninguno
    # despues del ultimo intento fallido
    assert len(sleeps) == orchestrator.MAX_RETRIES


def test_run_with_retry_does_not_retry_azure_not_configured(seed_execution, db_session, monkeypatch):
    execution = seed_execution()
    sleeps: list[float] = []
    monkeypatch.setattr(orchestrator.time, "sleep", lambda seconds: sleeps.append(seconds))
    calls = {"count": 0}

    def not_configured():
        calls["count"] += 1
        raise AzureNotConfiguredError("Azure no configurado")

    with pytest.raises(AzureNotConfiguredError):
        orchestrator._run_with_retry(db_session, execution, "extraction", not_configured)

    assert calls["count"] == 1
    assert sleeps == []


def test_run_execution_stores_sanitized_message_on_unexpected_error(seed_execution, db_session, monkeypatch):
    execution = seed_execution()

    def boom(_path):
        raise RuntimeError(r"fallo leyendo C:\Users\jorge\secreto.pdf")

    monkeypatch.setattr(orchestrator, "analyze_document", boom)
    monkeypatch.setattr(orchestrator.time, "sleep", lambda seconds: None)

    orchestrator.run_execution(execution.id, db_session)

    db_session.refresh(execution)
    assert execution.status == "error"
    assert execution.error_message is not None
    assert "C:\\Users" not in execution.error_message
    assert "[ruta omitida]" in execution.error_message


def test_run_execution_keeps_specific_message_when_azure_not_configured(seed_execution, db_session):
    execution = seed_execution()

    orchestrator.run_execution(execution.id, db_session)

    db_session.refresh(execution)
    assert execution.status == "error"
    assert "Azure Document Intelligence" in execution.error_message


def test_run_execution_notifies_regardless_of_outcome(seed_execution, db_session, monkeypatch):
    """El webhook (ver test_notifications.py para el detalle de su payload/fallas) debe
    dispararse al final de run_execution sin importar en que estado haya terminado -
    aca solo se confirma que orchestrator lo llama, no como se comporta."""
    workflow = Workflow(name="Flujo notificado", destination="webhook", destination_config={"url": "https://x"})
    db_session.add(workflow)
    db_session.commit()
    execution = seed_execution(workflow=workflow)

    notified = []
    monkeypatch.setattr(orchestrator.notifications, "notify_execution_complete", notified.append)

    orchestrator.run_execution(execution.id, db_session)

    assert len(notified) == 1
    assert notified[0].id == execution.id
