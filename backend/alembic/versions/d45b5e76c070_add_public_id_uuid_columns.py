"""add public_id uuid columns

Revision ID: d45b5e76c070
Revises: ebc8717b8832
Create Date: 2026-09-08 10:46:37.450607

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd45b5e76c070'
down_revision: Union[str, Sequence[str], None] = 'ebc8717b8832'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# tablas que ganan una columna public_id nueva (executions se maneja aparte: ya tenia
# "code", que se reemplaza por un UUID completo en vez de un hash corto de 8 caracteres)
TABLES_WITH_NEW_PUBLIC_ID = (
    "document_types",
    "document_type_versions",
    "documents",
    "workflows",
    "execution_events",
    "mapped_fields",
)


def _backfill_public_id(table_name: str) -> None:
    conn = op.get_bind()
    table = sa.table(table_name, sa.column("id", sa.Integer), sa.column("public_id", sa.String))
    # fetchall() antes de actualizar: MSSQL/pyodbc no soporta un segundo comando en la
    # misma conexion mientras el cursor del SELECT sigue abierto (sin MARS)
    row_ids = [row[0] for row in conn.execute(sa.select(table.c.id)).fetchall()]
    for row_id in row_ids:
        conn.execute(
            table.update().where(table.c.id == row_id).values(public_id=str(uuid.uuid4()))
        )


def upgrade() -> None:
    """Upgrade schema."""
    for table_name in TABLES_WITH_NEW_PUBLIC_ID:
        op.add_column(table_name, sa.Column("public_id", sa.String(length=36), nullable=True))
        _backfill_public_id(table_name)
        op.alter_column(table_name, "public_id", existing_type=sa.String(length=36), nullable=False)
        op.create_unique_constraint(f"uq_{table_name}_public_id", table_name, ["public_id"])

    # executions ya tenia "code" (hash corto de 8 caracteres, unique constraint
    # uq_executions_code) - se reemplaza por un UUID completo usado tambien en rutas/API
    op.drop_constraint("uq_executions_code", "executions", type_="unique")
    op.alter_column("executions", "code", new_column_name="public_id")
    op.alter_column(
        "executions",
        "public_id",
        existing_type=sa.String(length=12),
        type_=sa.String(length=36),
        nullable=False,
    )
    _backfill_public_id("executions")
    op.create_unique_constraint("uq_executions_public_id", "executions", ["public_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_executions_public_id", "executions", type_="unique")
    op.alter_column(
        "executions", "public_id", existing_type=sa.String(length=36), type_=sa.String(length=12)
    )
    op.alter_column("executions", "public_id", new_column_name="code")
    op.create_unique_constraint("uq_executions_code", "executions", ["code"])

    for table_name in reversed(TABLES_WITH_NEW_PUBLIC_ID):
        op.drop_constraint(f"uq_{table_name}_public_id", table_name, type_="unique")
        op.drop_column(table_name, "public_id")
