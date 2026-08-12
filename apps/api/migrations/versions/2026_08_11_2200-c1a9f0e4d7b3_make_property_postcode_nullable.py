"""make property_postcode nullable for hong kong submissions

Revision ID: c1a9f0e4d7b3
Revises: 982c0f4fed62
Create Date: 2026-08-11 22:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
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
    # A NOT NULL downgrade cannot be applied blindly once a real Hong Kong
    # row with a NULL property_postcode exists — there is no truthful
    # postcode to invent for it (HK has no postcode system at all), and
    # silently backfilling a fake value would corrupt that row's data.
    # Smallest safe policy: refuse the downgrade with a clear, actionable
    # error whenever such a row exists; only proceed when every existing
    # row already has a non-null postcode (e.g. an all-UK dataset, or an
    # empty table).
    connection = op.get_bind()
    null_postcode_count = connection.execute(
        sa.text("SELECT count(*) FROM repair_submissions WHERE property_postcode IS NULL")
    ).scalar_one()
    if null_postcode_count:
        raise RuntimeError(
            f"Cannot downgrade: {null_postcode_count} repair_submissions row(s) have a NULL "
            "property_postcode (Hong Kong submissions have no postcode system, so there is no "
            "truthful value to backfill). Resolve or remove those rows before downgrading."
        )
    op.alter_column('repair_submissions', 'property_postcode', nullable=False)
