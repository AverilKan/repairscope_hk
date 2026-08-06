from sqlalchemy import Boolean, Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PreferredContactMethod, SubmissionClosedReason, SubmissionStatus


class RepairSubmission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A landlord-submitted repair brief awaiting manual review. Deliberately
    not the canonical Repair entity from docs/BACKEND_INTEGRATION_CHECKLIST.md
    — this is the public-intake launch's own record, reviewed by a founder
    and only later (manually, outside this table) turned into real sourcing
    work. See docs/PUBLIC_INGESTION_LAUNCH.md."""

    __tablename__ = "repair_submissions"

    public_reference: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=SubmissionStatus.new,
        server_default=SubmissionStatus.new.value,
        index=True,
    )

    questionnaire_version: Mapped[str] = mapped_column(String, nullable=False)
    issue_category: Mapped[str] = mapped_column(String, nullable=False)
    questionnaire_answers: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_brief: Mapped[dict] = mapped_column(JSONB, nullable=False)
    safety_flags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    landlord_name: Mapped[str] = mapped_column(String, nullable=False)
    landlord_email: Mapped[str] = mapped_column(String, nullable=False)
    landlord_phone: Mapped[str] = mapped_column(String, nullable=False)
    property_postcode: Mapped[str] = mapped_column(String, nullable=False)
    property_address: Mapped[str | None] = mapped_column(String, nullable=True)
    preferred_contact_method: Mapped[PreferredContactMethod] = mapped_column(
        Enum(
            PreferredContactMethod,
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
    )
    access_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    consent_to_contact: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consent_to_share_with_contractors: Mapped[bool] = mapped_column(Boolean, nullable=False)

    internal_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_reason: Mapped[SubmissionClosedReason | None] = mapped_column(
        Enum(
            SubmissionClosedReason,
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=True,
    )
