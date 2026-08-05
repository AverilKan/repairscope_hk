from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import ClerkIdentityVerifier
from app.auth.identity import IdentityVerifier, InvalidBearerTokenError
from app.auth.principal import AuthenticatedPrincipal
from app.auth.provisioning import provision_user
from app.core.config import Settings, get_settings
from app.core.db import get_session


def get_identity_verifier(settings: Settings = Depends(get_settings)) -> IdentityVerifier:
    """Production default. Tests must override this dependency with
    FakeIdentityVerifier via app.dependency_overrides — there is no
    fallback verifier that works without a configured Clerk issuer, by
    design, so a missing override fails loudly instead of silently
    accepting arbitrary bearer tokens."""
    return ClerkIdentityVerifier(settings)


async def get_current_principal(
    authorization: str | None = Header(default=None),
    verifier: IdentityVerifier = Depends(get_identity_verifier),
    session: AsyncSession = Depends(get_session),
) -> AuthenticatedPrincipal:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    try:
        identity = await verifier.verify_bearer_token(token)
    except InvalidBearerTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired credentials.") from None

    user = await provision_user(session, identity)
    return AuthenticatedPrincipal(
        clerk_user_id=identity.external_user_id,
        repairscope_user_id=user.id,
        email_verified=identity.email_verified,
    )
