from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.schemas.repair_submissions import (
    RepairSubmissionCreateRequest,
    RepairSubmissionCreateResponse,
)
from app.services.repair_submissions import submit_repair_brief

router = APIRouter(prefix="/api/repair-submissions", tags=["repair-submissions"])

# Defense in depth on top of the per-field Pydantic length caps in
# app/schemas/repair_submissions.py — bounds the whole unauthenticated
# request body, not just individual fields.
_MAX_REQUEST_BODY_BYTES = 200_000


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
