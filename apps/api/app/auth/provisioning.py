from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.identity import VerifiedExternalIdentity
from app.models.user import User


async def provision_user(session: AsyncSession, identity: VerifiedExternalIdentity) -> User:
    """Find-or-create the RepairScope user for a verified external
    identity. Uses a single upsert on the unique clerk_user_id constraint
    rather than select-then-insert, so concurrent first-time requests from
    the same new user can't race into two rows or a duplicate-key error.
    Repeat authentication updates primary_email/last_seen_at rather than
    creating a new user.
    """
    statement = (
        insert(User)
        .values(
            clerk_user_id=identity.external_user_id,
            primary_email=identity.email,
            last_seen_at=func.now(),
        )
        .on_conflict_do_update(
            index_elements=[User.clerk_user_id],
            set_={
                "primary_email": identity.email,
                "last_seen_at": func.now(),
            },
        )
        .returning(User)
    )
    # populate_existing: without it, a second upsert for a user already in
    # this session's identity map returns the *cached* object untouched —
    # the RETURNING row's fresh primary_email/last_seen_at get silently
    # discarded instead of applied.
    result = await session.execute(statement, execution_options={"populate_existing": True})
    user = result.scalar_one()
    await session.commit()
    return user
