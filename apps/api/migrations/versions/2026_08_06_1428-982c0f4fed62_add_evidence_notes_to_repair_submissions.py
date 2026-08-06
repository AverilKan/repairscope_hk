"""add evidence notes to repair submissions

Revision ID: 982c0f4fed62
Revises: 8b9a7bc2485c
Create Date: 2026-08-06 14:28:19.687490

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '982c0f4fed62'
down_revision: str | Sequence[str] | None = '8b9a7bc2485c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('repair_submissions', sa.Column('evidence_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('repair_submissions', 'evidence_notes')
