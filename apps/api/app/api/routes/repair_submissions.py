import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_principal
from app.auth.principal import AuthenticatedPrincipal
from app.core.db import get_session
from app.repositories.repair_submissions import (
    get_submission_by_id,
    list_recent_submissions,
    update_submission_status,
)
from app.schemas.repair_submissions import (
    RepairSubmissionCreateRequest,
    RepairSubmissionCreateResponse,
    RepairSubmissionDetail,
    RepairSubmissionStatusUpdateRequest,
    RepairSubmissionSummary,
)
from app.services.authorization import AuthorizationService
from app.services.repair_submissions import submit_repair_brief

router = APIRouter(prefix="/api/repair-submissions", tags=["repair-submissions"])

# Defense in depth on top of the per-field Pydantic length caps in
# app/schemas/repair_submissions.py — bounds the whole unauthenticated
# request body, not just individual fields.
_MAX_REQUEST_BODY_BYTES = 200_000


def _detail_from_model(submission) -> RepairSubmissionDetail:
    return RepairSubmissionDetail.model_validate(submission, from_attributes=True)


def _summary_from_model(submission) -> RepairSubmissionSummary:
    return RepairSubmissionSummary.model_validate(submission, from_attributes=True)


async def _require_operator(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    await AuthorizationService(session).require_operator(principal.repairscope_user_id)
    return principal


@router.post("", response_model=RepairSubmissionCreateResponse, status_code=201)
async def create_repair_submission(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RepairSubmissionCreateResponse:
    content_length = request.headers.get("content-length")
    if content_length is not None and int(content_length) > _MAX_REQUEST_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large.")

    body = await request.body()
    if len(body) > _MAX_REQUEST_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large.")

    try:
        payload = RepairSubmissionCreateRequest.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=jsonable_encoder(error.errors())) from error

    submission = await submit_repair_brief(session, payload)
    return RepairSubmissionCreateResponse.model_validate(submission, from_attributes=True)


@router.get("", response_model=list[RepairSubmissionSummary])
async def list_repair_submissions(
    limit: int = 50,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> list[RepairSubmissionSummary]:
    bounded_limit = max(1, min(limit, 200))
    submissions = await list_recent_submissions(session, limit=bounded_limit)
    return [_summary_from_model(s) for s in submissions]


@router.get("/{submission_id}", response_model=RepairSubmissionDetail)
async def get_repair_submission(
    submission_id: uuid.UUID,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> RepairSubmissionDetail:
    submission = await get_submission_by_id(session, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return _detail_from_model(submission)


@router.patch("/{submission_id}", response_model=RepairSubmissionDetail)
async def update_repair_submission(
    submission_id: uuid.UUID,
    payload: RepairSubmissionStatusUpdateRequest,
    _principal: AuthenticatedPrincipal = Depends(_require_operator),
    session: AsyncSession = Depends(get_session),
) -> RepairSubmissionDetail:
    submission = await get_submission_by_id(session, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    updated = await update_submission_status(
        session,
        submission,
        status=payload.status,
        internal_review_notes=payload.internal_review_notes,
        closed_reason=payload.closed_reason,
    )
    return _detail_from_model(updated)
