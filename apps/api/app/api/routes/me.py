from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_principal
from app.auth.principal import AuthenticatedPrincipal
from app.core.db import get_session
from app.repositories.accounts import get_accounts_by_ids
from app.repositories.users import get_active_capabilities, get_active_memberships, get_user_by_id
from app.schemas.me import AccountMembershipSummary, CapabilitySummary, MeResponse

router = APIRouter(prefix="/api", tags=["me"])


@router.get("/me", response_model=MeResponse)
async def get_me(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> MeResponse:
    user = await get_user_by_id(session, principal.repairscope_user_id)
    if user is None:
        # The principal came from a just-provisioned user row, so this only
        # happens if the user was deleted between provisioning and this
        # query — treat it the same as any other missing resource.
        raise HTTPException(status_code=404, detail="User not found.")

    capabilities = await get_active_capabilities(session, user.id)
    memberships = await get_active_memberships(session, user.id)
    accounts_by_id = {
        account.id: account
        for account in await get_accounts_by_ids(session, {m.account_id for m in memberships})
    }

    return MeResponse(
        id=user.id,
        display_name=user.display_name,
        primary_email=user.primary_email,
        capabilities=[
            CapabilitySummary(
                capability=c.capability.value,
                source=c.source.value,
                granted_at=c.granted_at,
            )
            for c in capabilities
        ],
        account_memberships=[
            AccountMembershipSummary(
                account_id=m.account_id,
                account_name=accounts_by_id[m.account_id].name,
                role=m.role.value,
            )
            for m in memberships
            if m.account_id in accounts_by_id
        ],
    )
