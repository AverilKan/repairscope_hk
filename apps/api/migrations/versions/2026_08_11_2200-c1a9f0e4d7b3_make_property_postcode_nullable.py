"""make property_postcode nullable for hong kong submissions

Revision ID: c1a9f0e4d7b3
Revises: 982c0f4fed62
Create Date: 2026-08-11 22:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1a9f0e4d7b3'
down_revision: str | Sequence[str] | None = '982c0f4fed62'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Hong Kong properties have no postcode system — HK submissions carry
    # district/estate/block/floor/unit in questionnaire_answers and a
    # canonical property_address instead. See RepairSubmissionCreateRequest's
    # _require_some_property_location validator for the replacement
    # guarantee (at least one of postcode/address is still required).
    op.alter_column('repair_submissions', 'property_postcode', nullable=True)


def downgrade() -> None:
    op.alter_column('repair_submissions', 'property_postcode', nullable=False)
