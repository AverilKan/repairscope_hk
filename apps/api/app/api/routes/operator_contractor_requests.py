import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_principal
from app.auth.principal import AuthenticatedPrincipal
from app.core.db import get_session
from app.models.contractor_request import ContractorRequest
from app.repositories.contractor_requests import (
    get_contractor_request_by_id as repo_get_contractor_request_by_id,
)
from app.repositories.contractor_requests import list_contractor_requests_for_submission
from app.repositories.repair_submissions import get_submission_by_id
from app.schemas.contractor_requests import (
    ContractorRequestCreateRequest,
    ContractorRequestCreateResponse,
    ContractorRequestDetail,
    ContractorRequestSummary,
)
from app.services.authorization import AuthorizationService
from app.services.contractor_request_lifecycle import derive_status
from app.services.contractor_requests import (
    create_contractor_request_for_submission,
    revoke_contractor_request,
)

router = APIRouter(
    prefix="/api/repair-submissions/{submission_id}/contractor-requests",
    tags=["contractor-requests-operator"],
)


async def _require_operator(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    # Same composition as app/api/routes/repair_submissions.py's own
    # _require_operator — get_current_principal establishes authentication
    # only; AuthorizationService.require_operator is the separate,
    # explicit operator-capability check.
    await AuthorizationService(session).require_operator(principal.repairscope_user_id)
    return principal


async def _get_submission_or_404(submission_id: uuid.UUID, session: AsyncSession):
    submission = await get_submission_by_id(session, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return submission


async def _get_request_scoped_to_submission_or_404(
    submission_id: uuid.UUID, request_id: uuid.UUID, session: AsyncSession
) -> ContractorRequest:
    contractor_request = await repo_get_contractor_request_by_id(session, request_id)
    # A request that exists but belongs to a different submission is
    # deliberately indistinguishable from one that doesn't exist at all —
    # same "exists but not yours" concealment as app/core/errors.py's
    # NotFoundError. This is the case-isolation boundary: a request_id
    # from Case A must never be readable/revocable through Case B's
    # nested route just because the caller happens to be an operator.
    if contractor_request is None or contractor_request.repair_submission_id != submission_id:
        raise HTTPException(status_code=404, detail="Contractor request not found.")
    return contractor_request


def _summary_from_model(
    contractor_request: ContractorRequest, now: datetime
) -> ContractorRequestSummary:
    status = derive_status(
        responded_at=contractor_request.responded_at,
        revoked_at=contractor_request.revoked_at,
        expires_at=contractor_request.expires_at,
        now=now,
    )
    return ContractorRequestSummary(
        id=contractor_request.id,
        contractor_label=contractor_request.contractor_label,
        client_contractor_id=contractor_request.client_contractor_id,
        status=status.value,
        created_at=contractor_request.created_at,
        expires_at=contractor_request.expires_at,
        responded_at=contractor_request.responded_at,
        revoked_at=contractor_request.revoked_at,
    )


def _detail_from_model(
    contractor_request: ContractorRequest, now: datetime
) -> ContractorRequestDetail:
    summary = _summary_from_model(contractor_request, now)
    return ContractorRequestDetail(
        **summary.model_dump(),
        response_type=contractor_request.response_type,
        response_payload=contractor_request.response_payload,
        response_schema_version=contractor_request.response_schema_version,
    )


@router.post("", response_model=ContractorRequestCreateResponse, status_code=201)
async def create_contractor_request(
    submission_id: uuid.UUID,
    payload: ContractorRequestCreateRequest,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> ContractorRequestCreateResponse:
    submission = await _get_submission_or_404(submission_id, session)
    contractor_request, raw_token = await create_contractor_request_for_submission(
        session,
        submission,
        contractor_label=payload.contractor_label,
        client_contractor_id=payload.client_contractor_id,
    )
    return ContractorRequestCreateResponse(
        id=contractor_request.id,
        access_token=raw_token,
        contractor_label=contractor_request.contractor_label,
        client_contractor_id=contractor_request.client_contractor_id,
        expires_at=contractor_request.expires_at,
        created_at=contractor_request.created_at,
    )


@router.get("", response_model=list[ContractorRequestSummary])
async def list_contractor_requests(
    submission_id: uuid.UUID,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> list[ContractorRequestSummary]:
    await _get_submission_or_404(submission_id, session)
    requests = await list_contractor_requests_for_submission(session, submission_id)
    now = datetime.now(UTC)
    return [_summary_from_model(r, now) for r in requests]


@router.get("/{request_id}", response_model=ContractorRequestDetail)
async def get_contractor_request(
    submission_id: uuid.UUID,
    request_id: uuid.UUID,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> ContractorRequestDetail:
    await _get_submission_or_404(submission_id, session)
    contractor_request = await _get_request_scoped_to_submission_or_404(
        submission_id, request_id, session
    )
    return _detail_from_model(contractor_request, datetime.now(UTC))


@router.post("/{request_id}/revoke", response_model=ContractorRequestSummary)
async def revoke_contractor_request_route(
    submission_id: uuid.UUID,
    request_id: uuid.UUID,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> ContractorRequestSummary:
    await _get_submission_or_404(submission_id, session)
    contractor_request = await _get_request_scoped_to_submission_or_404(
        submission_id, request_id, session
    )
    now = datetime.now(UTC)
    updated = await revoke_contractor_request(session, contractor_request, now)
    return _summary_from_model(updated, now)
