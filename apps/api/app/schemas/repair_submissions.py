import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PreferredContactMethod, SubmissionStatus

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
    property_postcode: str = Field(max_length=_SHORT_TEXT_MAX)
    property_address: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    preferred_contact_method: PreferredContactMethod
    access_notes: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)

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


class RepairSubmissionCreateResponse(BaseModel):
    public_reference: str
    status: SubmissionStatus
    created_at: datetime
