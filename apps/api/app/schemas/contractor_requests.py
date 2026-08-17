import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.contractor_request import (
    CONTRACTOR_RESPONSE_SCHEMA_VERSION,
    STAGE1_SNAPSHOT_SCHEMA_VERSION,
)
from app.models.enums import ContractorResponseType


class Stage1SnapshotV1(BaseModel):
    """The frozen, contractor-visible sourcing snapshot — built exclusively
    by app/services/stage1_snapshot.py from a real repair submission, never
    accepted as input from any caller (see that module's docstring). Every
    string field here has already been validated against a closed
    server-side allowlist (app/services/stage1_allowlist.py) before this
    model is even constructed — `extra="forbid"` additionally guarantees no
    other key can ever ride along in the persisted JSONB column.

    Deliberately narrower than the frontend's Stage1ContractorBrief: this
    carries controlled IDS only (e.g. "leak", "wan-chai"), never resolved
    human-facing labels — humanising stays the frontend's job, reusing the
    exact same already-audited resolveAnswerLabel/resolveAnswerLabels
    functions the rest of the app already relies on for that.
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: int = STAGE1_SNAPSHOT_SCHEMA_VERSION
    category: str | None = None
    district: str | None = None
    affected: list[str] = []
    branchFirst: list[str] = []
    branchSecond: list[str] = []
    branchThird: list[str] = []
    duration: str | None = None
    frequency: str | None = None
    worsening: str | None = None
    priorStatus: str | None = None
    hasEvidence: str | None = None
    evidenceKind: str | None = None
    # Whether the owner gave "Other" free text for the observable-symptom
    # question — a content-free flag only; the free text itself is never
    # read by this backend at all (see app/services/stage1_snapshot.py).
    symptomOtherPresent: bool = False


class ContractorRequestPublicView(BaseModel):
    """The public GET response — deliberately minimal. `stage1` is
    populated only when status is "open"; a contractor who already
    responded never receives the previous response body back, only a
    truthful "responded" status. Never includes the internal repair UUID,
    the RS-xxxxxx public reference, contractor_label, client_contractor_id,
    owner identity/contact, exact property detail, operator notes, other
    contractors' data or any other request's data — none of those fields
    exist on this model at all."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["open", "responded", "revoked", "expired"]
    stage1: Stage1SnapshotV1 | None = None


# --- Public contractor response submission ---------------------------------

_SHORT_TEXT_MAX = 200
_LONG_TEXT_MAX = 2_000


class ContractorResponsePayload(BaseModel):
    """The public POST body — mirrors the frontend's ContractorResponsePayload
    field-for-field (domain/contractorResponse.ts's Omit<OperatorContractor,
    "id"|"name"|"trade"|"contactReference"|"status"|"notes">). `extra="forbid"`
    means an operator-only field (or any other unexpected key) is a hard
    422, never silently dropped or accepted.

    Unlike the frontend's own interactive, in-progress-typing normalization
    (which clears stale fields as the contractor changes their answer),
    this is validated once, at rest: a semantically invalid or internally
    contradictory submission is REJECTED (422), never silently repaired —
    see _check_conditional_fields below. A persisted response row therefore
    always represents data this backend itself considers valid, not just
    data the frontend once thought was valid before further edits."""

    model_config = ConfigDict(extra="forbid")

    responseType: ContractorResponseType
    originalResponse: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    inspectionRequirement: Literal["required", "recommended", "not-sure"] | None = None
    informationNeeded: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    priceType: Literal["fixed", "estimate", "range", "no-price"] | None = None
    price: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    priceMin: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    priceMax: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    proposedApproach: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    inclusions: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    exclusions: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    priceChangeFactors: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)
    expectedDuration: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX)
    earliestStart: str | None = Field(default=None, max_length=_SHORT_TEXT_MAX)
    guaranteeStatus: Literal["yes", "no", "not-stated"] | None = None
    guaranteeDetails: str | None = Field(default=None, max_length=_LONG_TEXT_MAX)

    @model_validator(mode="after")
    def _check_conditional_fields(self) -> "ContractorResponsePayload":
        response_type = self.responseType
        needs_inspection = ContractorResponseType.needs_inspection
        needs_more_information = ContractorResponseType.needs_more_information

        if self.inspectionRequirement is not None and response_type != needs_inspection:
            raise ValueError(
                "inspectionRequirement may only be set when responseType is 'needs-inspection'."
            )
        if response_type == needs_inspection and self.inspectionRequirement is None:
            raise ValueError(
                "inspectionRequirement is required when responseType is 'needs-inspection'."
            )

        if self.informationNeeded is not None and response_type != needs_more_information:
            raise ValueError(
                "informationNeeded may only be set when responseType is 'needs-more-information'."
            )
        if response_type == needs_more_information and not (self.informationNeeded or "").strip():
            raise ValueError(
                "informationNeeded is required when responseType is 'needs-more-information'."
            )

        proposal_only_fields_set = any(
            value is not None
            for value in (
                self.priceType,
                self.price,
                self.priceMin,
                self.priceMax,
                self.proposedApproach,
                self.inclusions,
                self.exclusions,
                self.priceChangeFactors,
                self.expectedDuration,
                self.earliestStart,
                self.guaranteeStatus,
                self.guaranteeDetails,
            )
        )
        if response_type != ContractorResponseType.proposal_provided:
            if proposal_only_fields_set:
                raise ValueError(
                    "Proposal fields may only be set when responseType is 'proposal-provided'."
                )
            return self

        # response_type == proposal_provided from here on.
        if self.priceType is None:
            raise ValueError("priceType is required when responseType is 'proposal-provided'.")

        if self.priceType in ("fixed", "estimate"):
            if self.price is None:
                raise ValueError(f"price is required when priceType is '{self.priceType}'.")
            if self.priceMin is not None or self.priceMax is not None:
                raise ValueError(
                    f"priceMin/priceMax must not be set when priceType is '{self.priceType}'."
                )
        elif self.priceType == "range":
            if self.price is not None:
                raise ValueError("price must not be set when priceType is 'range'.")
            if self.priceMin is None or self.priceMax is None:
                raise ValueError(
                    "priceMin and priceMax are both required when priceType is 'range'."
                )
            if self.priceMin > self.priceMax:
                raise ValueError("priceMin must not be greater than priceMax.")
        elif self.priceType == "no-price":
            if self.price is not None or self.priceMin is not None or self.priceMax is not None:
                raise ValueError(
                    "price/priceMin/priceMax must not be set when priceType is 'no-price'."
                )

        if self.guaranteeStatus != "yes" and self.guaranteeDetails is not None:
            raise ValueError("guaranteeDetails may only be set when guaranteeStatus is 'yes'.")

        return self


class ContractorResponseSubmitResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["responded"] = "responded"
    response_schema_version: int = CONTRACTOR_RESPONSE_SCHEMA_VERSION


# --- Authenticated operator schemas -----------------------------------

_LABEL_MAX = 200


class ContractorRequestCreateRequest(BaseModel):
    """The ONLY input an authenticated operator may supply when creating a
    request — never a Stage-1 snapshot, never any raw owner/case field
    (the backend builds the snapshot itself directly from the repair
    submission — see app/services/contractor_requests.py)."""

    model_config = ConfigDict(extra="forbid")

    contractor_label: str = Field(min_length=1, max_length=_LABEL_MAX)
    client_contractor_id: str | None = Field(default=None, max_length=_LABEL_MAX)


class ContractorRequestCreateResponse(BaseModel):
    """`access_token` is the raw contractor access token — present in this
    response ONLY, exactly once. It is not persisted anywhere (see
    app/services/contractor_tokens.py) and there is no endpoint that can
    ever return it again; if it is lost, the operator revokes this
    request and creates a replacement."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    access_token: str
    contractor_label: str
    client_contractor_id: str | None
    status: Literal["open"] = "open"
    expires_at: datetime
    created_at: datetime


class ContractorRequestSummary(BaseModel):
    """Never includes token_hash or the raw token — those fields simply
    don't exist on this model. `contractor_label`/`client_contractor_id`
    are operator-only reconciliation/display metadata (see
    app/models/contractor_request.py) — this schema is only ever returned
    to an authenticated operator, never to the public contractor-facing
    endpoints (contrast with ContractorRequestPublicView)."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    contractor_label: str
    client_contractor_id: str | None
    status: Literal["open", "responded", "revoked", "expired"]
    created_at: datetime
    expires_at: datetime
    responded_at: datetime | None
    revoked_at: datetime | None


class ContractorRequestDetail(ContractorRequestSummary):
    response_type: ContractorResponseType | None
    response_payload: dict | None
    response_schema_version: int | None
