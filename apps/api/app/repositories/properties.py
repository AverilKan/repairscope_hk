import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import GrantStatus
from app.models.property import Property, PropertyAccessGrant


async def get_property_by_id(session: AsyncSession, property_id: uuid.UUID) -> Property | None:
    return await session.get(Property, property_id)


async def get_active_access_grant(
    session: AsyncSession, property_id: uuid.UUID, user_id: uuid.UUID
) -> PropertyAccessGrant | None:
    statement = select(PropertyAccessGrant).where(
        PropertyAccessGrant.property_id == property_id,
        PropertyAccessGrant.user_id == user_id,
        PropertyAccessGrant.status == GrantStatus.active,
    )
    return (await session.execute(statement)).scalar_one_or_none()
