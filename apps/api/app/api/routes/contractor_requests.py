import math
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import ConflictError
from app.models.contractor_request import CONTRACTOR_RESPONSE_SCHEMA_VERSION
from app.models.contractor_request import ContractorRequest as ContractorRequestModel
from app.repositories.contractor_requests import (
    get_contractor_request_by_token_hash,
    try_submit_contractor_response,
)
from app.schemas.contractor_requests import (
    ContractorRequestPublicView,
    ContractorResponsePayload,
    ContractorResponseSubmitResult,
    Stage1SnapshotV1,
)
from app.services.contractor_request_lifecycle import ContractorRequestStatus, derive_status
from app.services.contractor_tokens import hash_access_token

router = APIRouter(prefix="/api/contractor-requests", tags=["contractor-requests"])

# No account/Clerk auth on this router at all — possession of the
# high-entropy request token is the entire access-control mechanism, scoped
# to exactly the one request that token hashes to. Mirrors the one existing
# unauthenticated route (POST /api/repair-submissions) rather than
# inventing a new "public bypass" pattern.
#
# Defense in depth on top of the per-field Pydantic length caps in
# app/schemas/contractor_requests.py — substantially smaller than the
# repair-submission intake's 200_000 byte cap: there are no uploads and no
# large JSON blobs here, only a handful of bounded text fields.
_MAX_REQUEST_BODY_BYTES = 20_000


def _parse_content_length(value: str) -> int | None:
    """Returns the parsed Content-Length in bytes, or None if the header
    value is not a valid non-negative integer. A real Content-Length is
    never negative or non-numeric — a caller sending "abc" or "-1" is
    sending a malformed request, not something to silently ignore or
    (worse) let reach a bare `int(...)` call that raises ValueError
    straight into an unhandled 500."""
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _safe_validation_error_detail(error: ValidationError) -> list[dict]:
    """A rejected non-finite price (see ContractorResponsePayload's
    allow_inf_nan=False) makes Pydantic echo the raw inf/nan value back in
    error["input"] — jsonable_encoder does not sanitize that, and
    Starlette's JSONResponse renders with allow_nan=False, so building the
    422 response *itself* would raise trying to report exactly this
    validation failure. Replace any such value with a safe placeholder
    before encoding."""
    errors = error.errors()
    for err in errors:
        value = err.get("input")
        if isinstance(value, float) and not math.isfinite(value):
            err["input"] = "<non-finite>"
    return jsonable_encoder(errors)


async def _load_request_by_token(
    token: str, session: AsyncSession
) -> ContractorRequestModel:
    # Lookup by hash only — the raw token is hashed here and never used to
    # query the database directly, and is never logged (see
    # app/main.py's UnexpectedErrorMiddleware path redaction).
    contractor_request = await get_contractor_request_by_token_hash(
        session, hash_access_token(token)
    )
    if contractor_request is None:
        # Deliberately a plain 404 with no further detail — unknown token
        # and (from this endpoint alone) "exists but not yours" are
        # indistinguishable, same convention as app/core/errors.py's
        # NotFoundError.
        raise HTTPException(status_code=404, detail="Not found.")
    return contractor_request


@router.get("/{token}", response_model=ContractorRequestPublicView)
async def get_contractor_request(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> ContractorRequestPublicView:
    contractor_request = await _load_request_by_token(token, session)
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=contractor_request.responded_at,
        revoked_at=contractor_request.revoked_at,
        expires_at=contractor_request.expires_at,
        now=now,
    )
    # The contractor never receives their own previous response body back
    # (or, obviously, the internal repair UUID / RS-xxxxxx reference /
    # contractor_label / client_contractor_id / any owner or operator
    # data — none of those fields exist on ContractorRequestPublicView at
    # all) — only the Stage-1 snapshot, and only while the request is
    # still open.
    stage1 = (
        Stage1SnapshotV1.model_validate(contractor_request.stage1_snapshot)
        if status == ContractorRequestStatus.open
        else None
    )
    return ContractorRequestPublicView(status=status.value, stage1=stage1)


@router.post("/{token}/response", response_model=ContractorResponseSubmitResult, status_code=201)
async def submit_contractor_response(
    token: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ContractorResponseSubmitResult:
    content_length_header = request.headers.get("content-length")
    if content_length_header is not None:
        content_length = _parse_content_length(content_length_header)
        if content_length is None:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.")
        if content_length > _MAX_REQUEST_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Request body too large.")

    # Content-Length is never trusted as the sole body-size defense — a
    # client could send a small/absent header and a large body anyway, so
    # the actual received length is always re-checked regardless of what
    # the header claimed (or whether it was even valid).
    body = await request.body()
    if len(body) > _MAX_REQUEST_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large.")

    try:
        payload = ContractorResponsePayload.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(
            status_code=422, detail=_safe_validation_error_detail(error)
        ) from error

    contractor_request = await _load_request_by_token(token, session)
    now = datetime.now(UTC)

    # Atomic first-write-wins — see try_submit_contractor_response's own
    # docstring. This is the sole authority for whether the write happens;
    # everything below only runs to report a truthful reason on failure.
    wrote = await try_submit_contractor_response(
        session,
        contractor_request.id,
        response_type=payload.responseType,
        response_payload=payload.model_dump(mode="json", exclude_none=True),
        response_schema_version=CONTRACTOR_RESPONSE_SCHEMA_VERSION,
        now=now,
    )
    if not wrote:
        await session.refresh(contractor_request)
        status = derive_status(
            responded_at=contractor_request.responded_at,
            revoked_at=contractor_request.revoked_at,
            expires_at=contractor_request.expires_at,
            now=now,
        )
        raise ConflictError(f"Contractor request is '{status.value}', not open.")

    return ContractorResponseSubmitResult()
