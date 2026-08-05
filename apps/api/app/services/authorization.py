import uuid
from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError
from app.models.enums import AccountRole, Capability, PropertyPermission
from app.repositories.properties import get_active_access_grant, get_property_by_id
from app.repositories.users import get_active_membership, has_active_capability

_PROPERTY_MANAGING_ROLES = {AccountRole.owner, AccountRole.admin}


class AuthorizationService:
    """Single place resource-permission decisions are made. Route handlers
    call this rather than embedding ownership/role checks inline — see
    docs/AUTHORIZATION_MODEL.md for the full policy this implements.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def require_capability(self, user_id: uuid.UUID, capability: Capability) -> None:
        if not await has_active_capability(self._session, user_id, capability):
            raise ForbiddenError(f"User does not have an active '{capability.value}' capability.")

    async def can_access_account(self, user_id: uuid.UUID, account_id: uuid.UUID) -> bool:
        membership = await get_active_membership(self._session, user_id, account_id)
        return membership is not None

    async def require_account_role(
        self, user_id: uuid.UUID, account_id: uuid.UUID, allowed_roles: Iterable[AccountRole]
    ) -> None:
        membership = await get_active_membership(self._session, user_id, account_id)
        if membership is None or membership.role not in set(allowed_roles):
            raise ForbiddenError(
                f"User does not hold an allowed role on account {account_id}."
            )

    async def can_view_property(self, user_id: uuid.UUID, property_id: uuid.UUID) -> bool:
        property_row = await get_property_by_id(self._session, property_id)
        if property_row is None:
            return False

        # Any active account membership (owner, admin or member) can view
        # every property the account owns.
        if await self.can_access_account(user_id, property_row.account_id):
            return True

        # Otherwise only an explicit grant (viewer or manager) on this
        # exact property counts — never another property on the account.
        grant = await get_active_access_grant(self._session, property_id, user_id)
        return grant is not None

    async def can_manage_property(self, user_id: uuid.UUID, property_id: uuid.UUID) -> bool:
        property_row = await get_property_by_id(self._session, property_id)
        if property_row is None:
            return False

        membership = await get_active_membership(
            self._session, user_id, property_row.account_id
        )
        if membership is not None and membership.role in _PROPERTY_MANAGING_ROLES:
            return True

        grant = await get_active_access_grant(self._session, property_id, user_id)
        return grant is not None and grant.permission == PropertyPermission.manager

    async def require_operator(self, user_id: uuid.UUID) -> None:
        await self.require_capability(user_id, Capability.operator)
