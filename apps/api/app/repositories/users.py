import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import AccountMembership
from app.models.enums import Capability, CapabilityStatus, MembershipStatus
from app.models.user import User, UserCapability


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_active_capabilities(
    session: AsyncSession, user_id: uuid.UUID
) -> list[UserCapability]:
    statement = select(UserCapability).where(
        UserCapability.user_id == user_id,
        UserCapability.status == CapabilityStatus.active,
    )
    return list((await session.execute(statement)).scalars().all())


async def has_active_capability(
    session: AsyncSession, user_id: uuid.UUID, capability: Capability
) -> bool:
    statement = select(UserCapability.id).where(
        UserCapability.user_id == user_id,
        UserCapability.capability == capability,
        UserCapability.status == CapabilityStatus.active,
    )
    return (await session.execute(statement)).first() is not None


async def get_active_memberships(
    session: AsyncSession, user_id: uuid.UUID
) -> list[AccountMembership]:
    statement = select(AccountMembership).where(
        AccountMembership.user_id == user_id,
        AccountMembership.status == MembershipStatus.active,
    )
    return list((await session.execute(statement)).scalars().all())


async def get_active_membership(
    session: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID
) -> AccountMembership | None:
    statement = select(AccountMembership).where(
        AccountMembership.user_id == user_id,
        AccountMembership.account_id == account_id,
        AccountMembership.status == MembershipStatus.active,
    )
    return (await session.execute(statement)).scalar_one_or_none()
