import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contractor_request import ContractorRequest
from app.models.enums import ContractorResponseType


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


async def try_submit_contractor_response(
    session: AsyncSession,
    request_id: uuid.UUID,
    *,
    response_type: ContractorResponseType,
    response_payload: dict,
    response_schema_version: int,
    now: datetime,
) -> bool:
    """Atomic first-write-wins submission. The WHERE clause is the sole
    authority for whether this write is allowed — never a prior read
    followed by a separate write, which would be racy (see the
    architecture review's Task 18: double-click, retry, two tabs, a
    revoke-in-flight, and a submit at the exact expiry instant all reduce
    to this one conditional UPDATE). Returns True if this call performed
    the write; False if the row was already responded to, already
    revoked, or already past its expiry — the caller then does a
    follow-up read only to produce the right error message, never to
    decide whether to write."""
    statement = (
        update(ContractorRequest)
        .where(
            ContractorRequest.id == request_id,
            ContractorRequest.responded_at.is_(None),
            ContractorRequest.revoked_at.is_(None),
            ContractorRequest.expires_at > now,
        )
        .values(
            responded_at=now,
            response_type=response_type,
            response_payload=response_payload,
            response_schema_version=response_schema_version,
        )
    )
    result = await session.execute(statement)
    await session.commit()
    return result.rowcount == 1
