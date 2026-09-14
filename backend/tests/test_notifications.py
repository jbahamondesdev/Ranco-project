from app.models.workflow import Workflow
from app.pipeline import notifications


def test_notify_execution_complete_posts_payload_for_webhook_destination(seed_execution, db_session, monkeypatch):
    workflow = Workflow(
        name="Flujo webhook",
        destination="webhook",
        destination_config={"url": "https://example.test/hook"},
    )
    db_session.add(workflow)
    db_session.commit()
    execution = seed_execution(workflow=workflow, status="completed")

    calls = []
    monkeypatch.setattr(notifications.httpx, "post", lambda url, **kw: calls.append((url, kw)))

    notifications.notify_execution_complete(execution)

    assert len(calls) == 1
    url, kwargs = calls[0]
    assert url == "https://example.test/hook"
    assert kwargs["json"]["execution_id"] == execution.public_id
    assert kwargs["json"]["status"] == "completed"
    assert kwargs["timeout"] == 10


def test_notify_execution_complete_skips_internal_db_destination(seed_execution, db_session, monkeypatch):
    workflow = Workflow(name="Flujo interno", destination="internal_db")
    db_session.add(workflow)
    db_session.commit()
    execution = seed_execution(workflow=workflow)

    calls = []
    monkeypatch.setattr(notifications.httpx, "post", lambda url, **kw: calls.append((url, kw)))

    notifications.notify_execution_complete(execution)

    assert calls == []


def test_notify_execution_complete_skips_when_no_workflow(seed_execution, monkeypatch):
    execution = seed_execution()  # sin workflow

    calls = []
    monkeypatch.setattr(notifications.httpx, "post", lambda url, **kw: calls.append((url, kw)))

    notifications.notify_execution_complete(execution)

    assert calls == []


def test_notify_execution_complete_skips_when_no_url_configured(seed_execution, db_session, monkeypatch):
    workflow = Workflow(name="Flujo webhook sin url", destination="webhook", destination_config=None)
    db_session.add(workflow)
    db_session.commit()
    execution = seed_execution(workflow=workflow)

    calls = []
    monkeypatch.setattr(notifications.httpx, "post", lambda url, **kw: calls.append((url, kw)))

    notifications.notify_execution_complete(execution)

    assert calls == []


def test_notify_execution_complete_swallows_request_failures(seed_execution, db_session, monkeypatch):
    workflow = Workflow(
        name="Flujo webhook roto",
        destination="webhook",
        destination_config={"url": "https://example.test/hook"},
    )
    db_session.add(workflow)
    db_session.commit()
    execution = seed_execution(workflow=workflow)

    def failing_post(*args, **kwargs):
        raise RuntimeError("conexion rechazada")

    monkeypatch.setattr(notifications.httpx, "post", failing_post)

    # no debe lanzar - es best-effort
    notifications.notify_execution_complete(execution)
