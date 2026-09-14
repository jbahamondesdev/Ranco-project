"""drop mapped field evidence

Revision ID: 54be1e16abff
Revises: 2c6841d0e98f
Create Date: 2026-09-10 17:38:34.411267

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54be1e16abff'
down_revision: Union[str, Sequence[str], None] = '2c6841d0e98f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('mapped_fields', 'evidence')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('mapped_fields', sa.Column('evidence', sa.JSON(), nullable=True))
