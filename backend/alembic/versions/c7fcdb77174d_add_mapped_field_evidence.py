"""add mapped field evidence

Revision ID: c7fcdb77174d
Revises: d45b5e76c070
Create Date: 2026-09-10 12:00:41.888442

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7fcdb77174d'
down_revision: Union[str, Sequence[str], None] = 'd45b5e76c070'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('mapped_fields', sa.Column('evidence', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('mapped_fields', 'evidence')
