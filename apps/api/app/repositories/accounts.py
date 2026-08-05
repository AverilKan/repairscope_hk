import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account


async def get_accounts_by_ids(
    session: AsyncSession, account_ids: Iterable[uuid.UUID]
) -> list[Account]:
    ids = list(account_ids)
    if not ids:
        return []
    statement = select(Account).where(Account.id.in_(ids))
    return list((await session.execute(statement)).scalars().all())
