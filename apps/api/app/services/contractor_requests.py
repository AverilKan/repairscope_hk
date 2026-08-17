from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.models.contractor_request import STAGE1_SNAPSHOT_SCHEMA_VERSION, ContractorRequest
from app.models.repair_submission import RepairSubmission
from app.repositories.contractor_requests import create_contractor_request
from app.services.contractor_request_lifecycle import DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS
from app.services.contractor_tokens import generate_access_token, hash_access_token
from app.services.stage1_snapshot import build_stage1_snapshot


async def create_contractor_request_for_submission(
    session: AsyncSession,
    submission: RepairSubmission,
    *,
    contractor_label: str,
    client_contractor_id: str | None,
) -> tuple[ContractorRequest, str]:
    """The only place a ContractorRequest is created. The Stage-1 snapshot
    is always built here, directly from `submission` (see
    app/services/stage1_snapshot.py's fail-closed builder) — a caller can
    only ever supply contractor_label/client_contractor_id, never any
    owner/case field, and never the snapshot itself. Returns the raw
    access token alongside the persisted row: this is the one and only
    moment the raw value exists outside this function's local scope — the
    caller (the create route) must return it to the operator and then let
    it go; nothing downstream of this function ever sees it again (see
    app/services/contractor_tokens.py)."""
    raw_token = generate_access_token()
    snapshot = build_stage1_snapshot(submission)
    now = datetime.now(UTC)

    contractor_request = ContractorRequest(
        repair_submission_id=submission.id,
        client_contractor_id=client_contractor_id,
        contractor_label=contractor_label,
        token_hash=hash_access_token(raw_token),
        stage1_snapshot=snapshot.model_dump(mode="json"),
        stage1_schema_version=STAGE1_SNAPSHOT_SCHEMA_VERSION,
        expires_at=now + timedelta(days=DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS),
    )
    created = await create_contractor_request(session, contractor_request)
    return created, raw_token


async def revoke_contractor_request(
    session: AsyncSession, contractor_request: ContractorRequest, now: datetime
) -> ContractorRequest:
    """OPEN -> revoked. Already REVOKED -> idempotent no-op (returns the
    current row unchanged; revoking twice is not an error). EXPIRED ->
    also allowed (an explicit administrative "close this out" action —
    harmless, since an expired request was already unusable via the
    public endpoints regardless of revoked_at). RESPONDED -> rejected: a
    committed response is historical fact and revocation must never
    pretend to undo it (see app/services/contractor_request_lifecycle.py's
    derive_status precedence, which this mirrors)."""
    if contractor_request.responded_at is not None:
        raise ConflictError(
            "Cannot revoke a contractor request that has already been responded to."
        )
    if contractor_request.revoked_at is None:
        contractor_request.revoked_at = now
        session.add(contractor_request)
        await session.commit()
        await session.refresh(contractor_request)
    return contractor_request


__all__ = ["create_contractor_request_for_submission", "revoke_contractor_request"]
