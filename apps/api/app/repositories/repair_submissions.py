import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SubmissionClosedReason, SubmissionStatus
from app.models.repair_submission import RepairSubmission


async def create_submission(
    session: AsyncSession, submission: RepairSubmission
) -> RepairSubmission:
    session.add(submission)
    await session.commit()
    await session.refresh(submission)
    return submission


async def get_submission_by_id(
    session: AsyncSession, submission_id: uuid.UUID
) -> RepairSubmission | None:
    return await session.get(RepairSubmission, submission_id)


async def get_submission_by_reference(
    session: AsyncSession, public_reference: str
) -> RepairSubmission | None:
    statement = select(RepairSubmission).where(
        RepairSubmission.public_reference == public_reference
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def list_recent_submissions(session: AsyncSession, limit: int = 50) -> list[RepairSubmission]:
    statement = select(RepairSubmission).order_by(RepairSubmission.created_at.desc()).limit(limit)
    return list((await session.execute(statement)).scalars().all())


async def update_submission_status(
    session: AsyncSession,
    submission: RepairSubmission,
    status: SubmissionStatus,
    internal_review_notes: str | None,
    closed_reason: SubmissionClosedReason | None,
) -> RepairSubmission:
    submission.status = status
    if internal_review_notes is not None:
        submission.internal_review_notes = internal_review_notes
    submission.closed_reason = closed_reason
    await session.commit()
    await session.refresh(submission)
    return submission
