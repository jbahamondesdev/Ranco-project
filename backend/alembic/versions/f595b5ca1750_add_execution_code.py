"""add execution code

Revision ID: f595b5ca1750
Revises: 0dd059614a93
Create Date: 2026-09-07 18:24:40.490475

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f595b5ca1750'
down_revision: Union[str, Sequence[str], None] = '0dd059614a93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('executions', sa.Column('code', sa.String(length=12), nullable=True))

    conn = op.get_bind()
    executions_table = sa.table('executions', sa.column('id', sa.Integer), sa.column('code', sa.String))
    for (execution_id,) in conn.execute(sa.select(executions_table.c.id)):
        conn.execute(
            executions_table.update()
            .where(executions_table.c.id == execution_id)
            .values(code=uuid.uuid4().hex[:8])
        )

    op.alter_column('executions', 'code', existing_type=sa.String(length=12), nullable=False)
    op.create_unique_constraint('uq_executions_code', 'executions', ['code'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_executions_code', 'executions', type_='unique')
    op.drop_column('executions', 'code')
