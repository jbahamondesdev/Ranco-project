from app.models.workflow import Workflow


def _seed(seed_execution, add_mapped_field, *, workflow: Workflow | None = None, field_value="Juan"):
    execution = seed_execution(workflow=workflow, status="completed", original_filename="factura.pdf")
    add_mapped_field(execution, field_name="nombre", value=field_value, confidence=0.95)
    return execution


def test_export_single_execution_returns_csv(client, seed_execution, add_mapped_field):
    execution = _seed(seed_execution, add_mapped_field)

    res = client.get(f"/executions/{execution.public_id}/export")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    body = res.text
    assert "campo,valor,valor_corregido,confianza,estado" in body
    assert "nombre,Juan" in body


def test_export_single_execution_not_found(client):
    res = client.get("/executions/does-not-exist/export")
    assert res.status_code == 404


def test_export_aggregate_by_workflow(client, db_session, seed_execution, add_mapped_field):
    workflow = Workflow(name="Flujo export")
    db_session.add(workflow)
    db_session.commit()

    _seed(seed_execution, add_mapped_field, workflow=workflow, field_value="Ana")
    _seed(seed_execution, add_mapped_field, workflow=workflow, field_value="Beto")
    _seed(seed_execution, add_mapped_field)  # otra ejecucion sin workflow, no deberia aparecer

    res = client.get("/executions/export", params={"workflow_id": workflow.public_id})

    assert res.status_code == 200
    body = res.text
    assert "ejecucion,documento,estado,inicio,nombre" in body
    assert "Ana" in body
    assert "Beto" in body
    assert body.count("factura.pdf") == 2


def test_export_aggregate_unknown_workflow_is_404(client):
    res = client.get("/executions/export", params={"workflow_id": "does-not-exist"})
    assert res.status_code == 404
