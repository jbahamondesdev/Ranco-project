import json

import pytest

from app.pipeline import mapping
from app.pipeline.document_intelligence import AzureNotConfiguredError


def test_map_fields_raises_when_not_configured():
    with pytest.raises(AzureNotConfiguredError):
        mapping.map_fields("contenido", [{"name": "x", "data_type": "texto"}], {})


class _FakeResponses:
    def __init__(self, output: dict):
        self._output = output
        self.last_kwargs: dict | None = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return type("FakeResponse", (), {"output_text": json.dumps(self._output)})()


class _FakeClient:
    def __init__(self, output: dict):
        self.responses = _FakeResponses(output)


def _configure_azure_openai(monkeypatch):
    settings = mapping.get_settings()
    monkeypatch.setattr(settings, "azure_openai_endpoint", "https://example.test/openai/v1")
    monkeypatch.setattr(settings, "azure_openai_key", "key")
    monkeypatch.setattr(settings, "azure_openai_deployment", "deploy")


def test_map_fields_includes_examples_as_few_shot_in_prompt(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"nombre": {"value": "Juan", "confidence": 0.9}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    fields_schema = [{"name": "nombre", "data_type": "texto"}]
    examples = [{"field_name": "nombre", "corrected_value": "Juan Perez"}]

    result = mapping.map_fields("contenido del documento", fields_schema, {}, examples)

    assert result.fields == [{"field_name": "nombre", "value": "Juan", "confidence": 0.9}]
    prompt = fake_client.responses.last_kwargs["input"]
    assert "Juan Perez" in prompt
    assert "correcciones manuales" in prompt.lower()


def test_map_fields_without_examples_omits_examples_section(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"nombre": {"value": "Juan", "confidence": 0.9}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    mapping.map_fields("contenido", [{"name": "nombre", "data_type": "texto"}], {})

    prompt = fake_client.responses.last_kwargs["input"]
    assert "correcciones manuales" not in prompt.lower()


def test_map_fields_table_field_serializes_rows(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient(
        {"items": {"rows": [{"producto": "A", "cantidad": 2}], "confidence": 0.7}}
    )
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    fields_schema = [{"name": "items", "data_type": "tabla"}]
    result = mapping.map_fields("contenido", fields_schema, {})

    assert result.fields[0]["field_name"] == "items"
    assert json.loads(result.fields[0]["value"]) == [{"producto": "A", "cantidad": 2}]
    assert result.fields[0]["confidence"] == 0.7


def test_map_fields_stringifies_numeric_value(monkeypatch):
    # regresion: el schema estricto hace que Azure OpenAI devuelva un numero JSON de
    # verdad (no un string) para campos "numero" - MappedField.value es una columna de
    # texto, y cualquier consumidor que espere un str se rompia con un valor no-string
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"total": {"value": 500, "confidence": 0.95}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    result = mapping.map_fields("Total: 500", [{"name": "total", "data_type": "numero"}], {})

    assert result.fields[0]["value"] == "500"
    assert isinstance(result.fields[0]["value"], str)


def test_map_fields_stringifies_float_and_boolean_values(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient(
        {
            "monto": {"value": 199.9, "confidence": 0.9},
            "vigente": {"value": True, "confidence": 0.8},
        }
    )
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    fields_schema = [
        {"name": "monto", "data_type": "numero"},
        {"name": "vigente", "data_type": "booleano"},
    ]
    result = mapping.map_fields("contenido", fields_schema, {})

    values = {f["field_name"]: f["value"] for f in result.fields}
    assert values["monto"] == "199.9"
    assert values["vigente"] == "true"
    assert all(isinstance(v, str) for v in values.values())


def test_map_fields_keeps_null_value_as_none(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"nombre": {"value": None, "confidence": 0.0}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    result = mapping.map_fields("contenido", [{"name": "nombre", "data_type": "texto"}], {})

    assert result.fields[0]["value"] is None


def test_map_fields_normalizes_percentage_fraction_to_base_100(monkeypatch):
    # regresion: MAPPING_SYSTEM_PROMPT le pide al modelo devolver "15" para "15%", pero
    # nada garantiza que lo siga siempre - si devuelve la fraccion (0.15), se corrige en
    # codigo para que los umbrales min/max configurados sobre el campo (ej. min 0, max
    # 100) se puedan aplicar de forma consistente.
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"iva": {"value": 0.19, "confidence": 0.9}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    result = mapping.map_fields("IVA: 19%", [{"name": "iva", "data_type": "porcentaje"}], {})

    assert result.fields[0]["value"] == "19"


def test_map_fields_leaves_already_normalized_percentage_untouched(monkeypatch):
    _configure_azure_openai(monkeypatch)
    fake_client = _FakeClient({"iva": {"value": 19, "confidence": 0.9}})
    monkeypatch.setattr("openai.OpenAI", lambda **kw: fake_client)

    result = mapping.map_fields("IVA: 19%", [{"name": "iva", "data_type": "porcentaje"}], {})

    assert result.fields[0]["value"] == "19"
