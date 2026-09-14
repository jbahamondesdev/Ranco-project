from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registra todos los modelos en Base.metadata
from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models.document import Document
from app.models.document_type import DocumentType, DocumentTypeVersion
from app.models.execution import Execution, MappedField
from app.models.workflow import Workflow


@pytest.fixture(autouse=True)
def _reset_azure_settings(monkeypatch):
    """Los tests no deben depender de que backend/.env tenga (o no) credenciales reales
    de Azure configuradas en la maquina de quien los corre - se fuerzan vacias siempre,
    y quien necesite simular "configurado" lo hace explicito en su propio test."""
    settings = get_settings()
    for field in (
        "azure_di_endpoint",
        "azure_di_key",
        "azure_openai_endpoint",
        "azure_openai_key",
        "azure_openai_deployment",
    ):
        monkeypatch.setattr(settings, field, "")


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def seed_execution(db_session):
    """Factory que arma la cadena DocumentType -> DocumentTypeVersion -> Document ->
    Execution minima necesaria para testear el pipeline, sin repetir ese boilerplate
    en cada archivo de test. Usar junto con `add_mapped_field` para casos que
    necesiten campos mapeados."""

    def _seed(
        *,
        document_type: DocumentType | None = None,
        workflow: Workflow | None = None,
        status: str = "pending",
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        original_filename: str = "doc.pdf",
    ) -> Execution:
        doc_type = document_type
        if doc_type is None:
            doc_type = DocumentType(name=f"Tipo test {id(object())}")
            db_session.add(doc_type)
            db_session.commit()

        version = DocumentTypeVersion(
            document_type_id=doc_type.id, version_number=1, fields_schema=[], status="published"
        )
        db_session.add(version)
        db_session.commit()

        document = Document(original_filename=original_filename, storage_path=f"/tmp/{original_filename}")
        db_session.add(document)
        db_session.commit()

        execution = Execution(
            document_id=document.id,
            document_type_version_id=version.id,
            workflow_id=workflow.id if workflow else None,
            status=status,
            started_at=started_at or datetime.now(timezone.utc),
            completed_at=completed_at,
        )
        db_session.add(execution)
        db_session.commit()
        return execution

    return _seed


@pytest.fixture()
def add_mapped_field(db_session):
    """Factory que agrega un MappedField a una ejecucion ya creada (ver `seed_execution`)."""

    def _add(
        execution: Execution,
        *,
        field_name: str = "campo",
        data_type: str = "texto",
        value: str | None = "valor",
        confidence: float | None = 0.9,
        status: str = "ok",
        corrected_value: str | None = None,
        resolved: bool = False,
    ) -> MappedField:
        field = MappedField(
            execution_id=execution.id,
            field_name=field_name,
            data_type=data_type,
            value=value,
            confidence=confidence,
            status=status,
            corrected_value=corrected_value,
            resolved=resolved,
        )
        db_session.add(field)
        db_session.commit()
        db_session.refresh(field)
        return field

    return _add
