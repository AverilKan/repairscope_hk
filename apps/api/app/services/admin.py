from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Capability, CapabilitySource, CapabilityStatus
from app.models.user import User, UserCapability
from app.repositories.users import has_active_capability


class UnknownUserError(Exception):
    """Raised when an administrative command is given a user identifier
    that doesn't resolve to an existing RepairScope user. Refusing rather
    than creating a placeholder row — granting a capability must never be
    what causes a user to first come into existence."""


async def grant_capability(
    session: AsyncSession,
    user: User | None,
    capability: Capability,
) -> UserCapability | None:
    """Grants exactly the requested capability to an already-provisioned
    user. `user=None` (the caller's lookup found nothing) raises
    UnknownUserError rather than granting anything — this is the one place
    that refusal is enforced, whether called from the CLI or a test.
    Idempotent: if the user already has an active grant for this
    capability, does nothing and returns None rather than creating a
    duplicate row (the partial unique index on (user_id, capability) WHERE
    status='active' would reject a duplicate anyway, but checking first
    keeps repeat runs silent rather than erroring). Never touches any
    other capability the user has or doesn't have."""
    if user is None:
        raise UnknownUserError(
            "No RepairScope user found for the given identifier. Refusing to "
            "grant a capability to an unknown user."
        )
    if await has_active_capability(session, user.id, capability):
        return None

    grant = UserCapability(
        user_id=user.id,
        capability=capability,
        status=CapabilityStatus.active,
        source=CapabilitySource.operator_grant,
        granted_at=datetime.now(UTC),
    )
    session.add(grant)
    await session.commit()
    await session.refresh(grant)
    return grant
