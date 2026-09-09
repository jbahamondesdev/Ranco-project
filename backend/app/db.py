from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.sqlalchemy_database_uri, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_by_public_id(db: Session, model, public_id: str):
    """Busca una fila por su public_id (UUID expuesto en la API) en vez de por el id
    interno entero, que nunca se expone fuera del backend."""
    return db.scalar(select(model).where(model.public_id == public_id))


def get_or_404(db: Session, model, public_id: str, detail: str):
    """Como get_by_public_id, pero lanza HTTPException(404, detail) si no existe.
    Ahorra repetir el if/raise en cada router para el caso comun de "buscar por
    public_id o devolver 404"."""
    obj = get_by_public_id(db, model, public_id)
    if not obj:
        raise HTTPException(404, detail)
    return obj


def ensure_database_exists() -> None:
    """Creates the app database on the local SQL Server instance if it doesn't exist yet."""
    master_engine = create_engine(
        settings.master_sqlalchemy_database_uri, isolation_level="AUTOCOMMIT"
    )
    with master_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM sys.databases WHERE name = :name"),
            {"name": settings.sql_database},
        ).first()
        if not exists:
            conn.execute(text(f"CREATE DATABASE [{settings.sql_database}]"))
    master_engine.dispose()
