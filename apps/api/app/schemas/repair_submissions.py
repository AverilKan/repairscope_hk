import json
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import PreferredContactMethod, SubmissionClosedReason, SubmissionStatus

# Public submissions are unauthenticated, so every free-form field is capped
# to keep a single malicious/malformed request bounded. These are generous
# enough for real questionnaire/brief payloads (the frontend, not this API,
# owns the actual field structure) without allowing unbounded storage abuse.
_JSON_BLOB_MAX_CHARS = 50_000
_SHORT_TEXT_MAX = 200
_LONG_TEXT_MAX = 5_000


def _validate_json_blob_size(value: dict, field_name: str) -> dict:
    if len(json.dumps(value)) > _JSON_BLOB_MAX_CHARS:
        raise ValueError(
            f"{field_name} is too large (max {_JSON_BLOB_MAX_CHARS} characters serialized)."
        )
    return value


def _validate_email_shape(value: str) -> str:
    if "@" not in value or " " in value or len(value) > _SHORT_TEXT_MAX:
        raise ValueError("landlord_email must be a plausible email address.")
    return value


class RepairSubmissionCreateRequest(BaseModel):
    # Public callers may only ever populate these fields — status,
    # internal_review_notes and closed_reason are review-side only and must
    # never be settable through the public endpoint, so unexpected fields
    # (rather than being silently dropped) are a hard validation error.
    model_config = ConfigDict(extra="forbid")

    questionnaire_version: str = Field(max_length=_SHORT_TEXT_MAX)
    issue_category: str = Field(max_length=_SHORT_TEXT_MAX)
    questionnaire_answers: dict
    generated_brief: dict
    safety_flags: list[str] = Field(default_factory=list, max_length=50)

    landlord_name: str = Field(max_length=_SHORT_TEXT_MAX)
    landlord_email: str = Field(max_length=_SHORT_TEXT_MAX)
    landlord_phone: str = Field(max_length=_SHORT_TEXT_MAX)
    # Optional: Hong Kong properties have no postcode. The HK public intake
    # sends district/estate/block/floor/unit inside questionnaire_answers and
    # a canonical human-readable property_address instead.
    property_postcode: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX)
    property_address: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    preferred_contact_method: PreferredContactMethod
    access_notes: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    evidence_notes: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)

    consent_to_contact: bool
    consent_to_share_with_contractors: bool

    @field_validator("questionnaire_answers")
    @classmethod
    def _check_answers_size(cls, value: dict) -> dict:
        return _validate_json_blob_size(value, "questionnaire_answers")

    @field_validator("generated_brief")
    @classmethod
    def _check_brief_size(cls, value: dict) -> dict:
        return _validate_json_blob_size(value, "generated_brief")

    @field_validator("landlord_email")
    @classmethod
    def _check_email_shape(cls, value: str) -> str:
        return _validate_email_shape(value)

    @field_validator("consent_to_contact")
    @classmethod
    def _require_contact_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError(
                "consent_to_contact must be true to submit — RepairScope cannot follow up "
                "otherwise."
            )
        return value

    @field_validator("safety_flags")
    @classmethod
    def _check_flag_lengths(cls, value: list[str]) -> list[str]:
        for flag in value:
            if len(flag) > _SHORT_TEXT_MAX:
                raise ValueError("Each safety flag must be short.")
        return value

    @model_validator(mode="after")
    def _require_some_property_location(self) -> "RepairSubmissionCreateRequest":
        # Hong Kong submissions have no postcode, so property_address (built
        # from district/estate/block/floor/unit) is what locates the
        # property instead — at least one of the two must be present.
        if not (self.property_postcode or "").strip() and not (
            self.property_address or ""
        ).strip():
            raise ValueError(
                "Either property_postcode or property_address is required."
            )
        return self


class RepairSubmissionCreateResponse(BaseModel):
    public_reference: str
    status: SubmissionStatus
    created_at: datetime


class RepairSubmissionSummary(BaseModel):
    id: uuid.UUID
    public_reference: str
    status: SubmissionStatus
    issue_category: str
    landlord_name: str
    property_postcode: str | None
    safety_flags: list[str]
    created_at: datetime


class RepairSubmissionDetail(BaseModel):
    id: uuid.UUID
    public_reference: str
    status: SubmissionStatus
    questionnaire_version: str
    issue_category: str
    questionnaire_answers: dict
    generated_brief: dict
    safety_flags: list[str]

    landlord_name: str
    landlord_email: str
    landlord_phone: str
    property_postcode: str | None
    property_address: str | None
    preferred_contact_method: PreferredContactMethod
    access_notes: str | None
    evidence_notes: str | None

    consent_to_contact: bool
    consent_to_share_with_contractors: bool

    internal_review_notes: str | None
    closed_reason: SubmissionClosedReason | None

    created_at: datetime
    updated_at: datetime


# Public submissions always start at SubmissionStatus.new (see
# app/services/repair_submissions.py) — operators may only ever move a
# submission to one of these; "new" is deliberately excluded so a review
# action can't reset a submission back to unreviewed.
_OPERATOR_SETTABLE_STATUSES = (
    SubmissionStatus.reviewing,
    SubmissionStatus.pursuing,
    SubmissionStatus.needs_landlord_information,
    SubmissionStatus.closed,
)


class RepairSubmissionStatusUpdateRequest(BaseModel):
    status: SubmissionStatus
    internal_review_notes: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    closed_reason: SubmissionClosedReason | None = None

    @field_validator("status")
    @classmethod
    def _check_status_settable(cls, value: SubmissionStatus) -> SubmissionStatus:
        if value not in _OPERATOR_SETTABLE_STATUSES:
            raise ValueError(
                f"status must be one of {[s.value for s in _OPERATOR_SETTABLE_STATUSES]}."
            )
        return value

    @model_validator(mode="after")
    def _check_closed_reason_present_when_closing(self) -> "RepairSubmissionStatusUpdateRequest":
        # A plain field_validator on closed_reason would not run at all here,
        # since Pydantic v2 skips validators for a field left at its default
        # (None) unless validate_default=True — a model-level validator
        # always runs regardless, so this is the reliable place to enforce
        # the closed/closed_reason pairing.
        if self.status == SubmissionStatus.closed and self.closed_reason is None:
            raise ValueError("closed_reason is required when status is 'closed'.")
        if self.status != SubmissionStatus.closed and self.closed_reason is not None:
            raise ValueError("closed_reason must only be set when status is 'closed'.")
        return self
