def test_create_get_and_list_document_type(client):
    res = client.post("/document-types", json={"name": "Factura"})
    assert res.status_code == 201
    doc_type = res.json()
    assert doc_type["name"] == "Factura"
    assert doc_type["status"] == "draft"

    res = client.get(f"/document-types/{doc_type['id']}")
    assert res.status_code == 200
    assert res.json()["versions"] == []

    res = client.get("/document-types")
    assert res.status_code == 200
    assert [dt["name"] for dt in res.json()] == ["Factura"]


def test_create_document_type_duplicate_name_conflicts(client):
    client.post("/document-types", json={"name": "Contrato"})
    res = client.post("/document-types", json={"name": "Contrato"})
    assert res.status_code == 409


def test_get_unknown_document_type_is_404(client):
    res = client.get("/document-types/does-not-exist")
    assert res.status_code == 404


def test_create_and_publish_version(client):
    doc_type = client.post("/document-types", json={"name": "Boleta"}).json()

    fields_schema = [
        {"name": "monto", "data_type": "numero", "required": True},
        {
            "name": "items",
            "data_type": "tabla",
            "required": False,
            "columns": [{"name": "producto", "data_type": "texto"}],
        },
    ]
    res = client.post(
        f"/document-types/{doc_type['id']}/versions",
        json={"fields_schema": fields_schema},
    )
    assert res.status_code == 201
    version = res.json()
    assert version["version_number"] == 1
    assert version["status"] == "draft"
    assert version["extraction_schema"]["required"] == ["monto", "items"]

    res = client.post(f"/document-types/{doc_type['id']}/versions/{version['id']}/publish")
    assert res.status_code == 200
    assert res.json()["status"] == "published"

    res = client.get(f"/document-types/{doc_type['id']}")
    assert res.json()["status"] == "published"


def test_delete_document_type_without_dependencies(client):
    doc_type = client.post("/document-types", json={"name": "Recibo"}).json()

    res = client.delete(f"/document-types/{doc_type['id']}")
    assert res.status_code == 204

    res = client.get(f"/document-types/{doc_type['id']}")
    assert res.status_code == 404
