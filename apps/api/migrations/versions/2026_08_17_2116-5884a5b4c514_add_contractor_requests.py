"""add contractor requests

Revision ID: 5884a5b4c514
Revises: c1a9f0e4d7b3
Create Date: 2026-08-17 21:16:45.348199

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "5884a5b4c514"
down_revision: str | Sequence[str] | None = "c1a9f0e4d7b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contractor_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("repair_submission_id", sa.UUID(), nullable=False),
        sa.Column("client_contractor_id", sa.String(length=200), nullable=True),
        sa.Column("contractor_label", sa.String(length=200), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("stage1_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("stage1_schema_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "response_type",
            sa.Enum(
                "interested",
                "needs_inspection",
                "needs_more_information",
                "not_suitable",
                "proposal_provided",
                name="contractorresponsetype",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column("response_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("response_schema_version", sa.Integer(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repair_submission_id"], ["repair_submissions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_contractor_requests_repair_submission_id"),
        "contractor_requests",
        ["repair_submission_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_contractor_requests_token_hash"),
        "contractor_requests",
        ["token_hash"],
        unique=True,
    )
    # Autogenerate also proposed dropping and recreating every unrelated
    # table's Enum-derived CHECK constraints (accountrole, membershipstatus,
    # accountstatus, ..., userstatus) — this is the known Alembic
    # check-constraint reflection false positive documented in README.md
    # ("Known tooling quirk"), not a real diff. Deliberately omitted here.


def downgrade() -> None:
    op.drop_index(op.f("ix_contractor_requests_token_hash"), table_name="contractor_requests")
    op.drop_index(
        op.f("ix_contractor_requests_repair_submission_id"), table_name="contractor_requests"
    )
    op.drop_table("contractor_requests")
