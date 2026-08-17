import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contractor_request import ContractorRequest


async def create_contractor_request(
    session: AsyncSession, contractor_request: ContractorRequest
) -> ContractorRequest:
    session.add(contractor_request)
    await session.commit()
    await session.refresh(contractor_request)
    return contractor_request


async def get_contractor_request_by_id(
    session: AsyncSession, request_id: uuid.UUID
) -> ContractorRequest | None:
    return await session.get(ContractorRequest, request_id)


async def get_contractor_request_by_token_hash(
    session: AsyncSession, token_hash: str
) -> ContractorRequest | None:
    # Lookup by hash only — never by any plaintext/raw token value (the raw
    # token is never persisted at all, see app/services/contractor_tokens.py).
    statement = select(ContractorRequest).where(ContractorRequest.token_hash == token_hash)
    return (await session.execute(statement)).scalar_one_or_none()


async def list_contractor_requests_for_submission(
    session: AsyncSession, repair_submission_id: uuid.UUID
) -> list[ContractorRequest]:
    statement = (
        select(ContractorRequest)
        .where(ContractorRequest.repair_submission_id == repair_submission_id)
        .order_by(ContractorRequest.created_at.desc())
    )
    return list((await session.execute(statement)).scalars().all())
