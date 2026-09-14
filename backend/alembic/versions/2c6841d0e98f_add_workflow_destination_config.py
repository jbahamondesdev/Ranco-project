"""add workflow destination config

Revision ID: 2c6841d0e98f
Revises: c7fcdb77174d
Create Date: 2026-09-10 12:05:08.326289

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c6841d0e98f'
down_revision: Union[str, Sequence[str], None] = 'c7fcdb77174d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('workflows', sa.Column('destination_config', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('workflows', 'destination_config')
