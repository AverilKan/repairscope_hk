import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ContractorResponseType

STAGE1_SNAPSHOT_SCHEMA_VERSION = 1
CONTRACTOR_RESPONSE_SCHEMA_VERSION = 1


class ContractorRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single invitation for one contractor to respond to one repair
    submission over an unauthenticated, token-scoped transport — see the
    approved contractor-transport architecture review. Deliberately one
    table with nullable response columns rather than two tables: there is
    no revision-history requirement (a request accepts at most one final
    response — see submit semantics in app/services/contractor_requests.py),
    so a satellite response table would only add a join for no benefit.

    This table does NOT make the frontend's OperatorContractor/comparison
    working state server-side — that remains localStorage-only. This is a
    server-side inbox only: an authenticated operator creates a request and
    later reviews/imports what comes back, exactly as the existing
    copy/paste import flow already works, just with a real transport
    underneath.
    """

    __tablename__ = "contractor_requests"

    # Every request belongs to exactly one real repair submission. Plain FK,
    # no ondelete — matches every other FK in this codebase (see
    # app/models/property.py, app/models/user.py): the repo's convention is
    # to leave delete semantics at the database default (RESTRICT) rather
    # than inventing cascade behaviour, and nothing here needs it either —
    # a repair_submissions row is never deleted through this application.
    repair_submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repair_submissions.id"), nullable=False, index=True
    )

    # Non-authoritative reconciliation hint supplied by the operator at
    # creation time — the frontend's existing OperatorContractor.id from its
    # localStorage-only working state. Never a foreign key, never used for
    # authorization, never treated as contractor identity. If it doesn't
    # resolve locally (cleared storage, different browser, removed
    # contractor), the operator simply falls back to manual selection —
    # see the architecture review's client_contractor_id analysis.
    # Length matches ContractorRequestCreateRequest's _LABEL_MAX (see
    # app/schemas/contractor_requests.py) — the DB constraint mirrors the
    # API contract rather than silently allowing more than the schema
    # ever permits a caller to submit.
    client_contractor_id: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Operator-authenticated, operator-only display/reconciliation label —
    # "who did I send this to?" (e.g. "ABC Plumbing"). NOT contractor
    # identity, NOT authentication, NOT a directory entry. Required at
    # creation time (an operator always knows who they're sending a request
    # to) so a request is identifiable even if client_contractor_id no
    # longer resolves to anything locally. Same 200-character bound as
    # client_contractor_id above, for the same reason.
    contractor_label: Mapped[str] = mapped_column(String(200), nullable=False)

    # SHA-256 hex digest (64 chars) of the raw access token — the raw value
    # is never persisted anywhere (see app/services/contractor_tokens.py).
    # Unique + indexed: this is the sole lookup path for the public
    # GET/POST endpoints, and uniqueness makes a hash collision structurally
    # impossible to silently grant access to the wrong request.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    # The frozen, server-built, fail-closed Stage-1 sourcing snapshot (see
    # app/services/stage1_snapshot.py) — built directly from the repair
    # submission at request-creation time, never accepted from a caller.
    # Every string value inside has already passed a closed server-side
    # allowlist before this row is ever written; there is no raw owner
    # free text or unvalidated identifier anywhere in this column.
    stage1_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    stage1_schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=STAGE1_SNAPSHOT_SCHEMA_VERSION,
        server_default=str(STAGE1_SNAPSHOT_SCHEMA_VERSION),
    )

    # Set together, exactly once, by the atomic first-write-wins submission
    # (see app/services/contractor_requests.py) — response_type is a small
    # dedicated column (mirrors the ContractorResponseType enum) so
    # operator listings can filter/display it without unpacking JSON;
    # response_payload carries the rest of the validated
    # ContractorResponsePayload-shaped data.
    response_type: Mapped[ContractorResponseType | None] = mapped_column(
        Enum(
            ContractorResponseType, native_enum=False, validate_strings=True, create_constraint=True
        ),
        nullable=True,
    )
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_schema_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Lifecycle is derived from these three timestamps wherever possible
    # (see app/services/contractor_request_lifecycle.py) rather than a
    # separate persisted status column — OPEN/RESPONDED/REVOKED/EXPIRED
    # never need to be independently updated out of sync with the
    # timestamp that actually caused the transition.
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
