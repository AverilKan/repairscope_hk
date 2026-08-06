"""add repair submissions

Revision ID: 8b9a7bc2485c
Revises: 8ed561c12765
Create Date: 2026-08-06 10:57:55.401498

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "8b9a7bc2485c"
down_revision: str | Sequence[str] | None = "8ed561c12765"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "repair_submissions",
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
        sa.Column("public_reference", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "reviewing",
                "pursuing",
                "needs_landlord_information",
                "closed",
                name="submissionstatus",
                native_enum=False,
                create_constraint=True,
            ),
            server_default="new",
            nullable=False,
        ),
        sa.Column("questionnaire_version", sa.String(), nullable=False),
        sa.Column("issue_category", sa.String(), nullable=False),
        sa.Column("questionnaire_answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated_brief", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("safety_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("landlord_name", sa.String(), nullable=False),
        sa.Column("landlord_email", sa.String(), nullable=False),
        sa.Column("landlord_phone", sa.String(), nullable=False),
        sa.Column("property_postcode", sa.String(), nullable=False),
        sa.Column("property_address", sa.String(), nullable=True),
        sa.Column(
            "preferred_contact_method",
            sa.Enum(
                "email",
                "phone",
                name="preferredcontactmethod",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("access_notes", sa.Text(), nullable=True),
        sa.Column("consent_to_contact", sa.Boolean(), nullable=False),
        sa.Column("consent_to_share_with_contractors", sa.Boolean(), nullable=False),
        sa.Column("internal_review_notes", sa.Text(), nullable=True),
        sa.Column(
            "closed_reason",
            sa.Enum(
                "urgent",
                "outside_current_scope",
                "not_currently_viable",
                "outside_service_area",
                "duplicate",
                "other",
                name="submissionclosedreason",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_repair_submissions_public_reference"),
        "repair_submissions",
        ["public_reference"],
        unique=True,
    )
    op.create_index(
        op.f("ix_repair_submissions_status"), "repair_submissions", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_repair_submissions_status"), table_name="repair_submissions")
    op.drop_index(op.f("ix_repair_submissions_public_reference"), table_name="repair_submissions")
    op.drop_table("repair_submissions")
