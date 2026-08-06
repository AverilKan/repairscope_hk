from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import ClerkIdentityVerifier
from app.auth.identity import (
    AuthenticationUnavailableError,
    IdentityVerifier,
    InvalidBearerTokenError,
    VerifiedExternalIdentity,
)
from app.auth.principal import AuthenticatedPrincipal
from app.auth.provisioning import provision_user
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ForbiddenError
from app.models.enums import UserStatus


class UnavailableIdentityVerifier:
    """Stand-in used when Clerk isn't configured (no REPAIRSCOPE_CLERK_ISSUER/
    REPAIRSCOPE_CLERK_AUTHORIZED_PARTIES) — typically local/dev environments
    where public repair-intake is still meant to be testable. Never touches
    the network or PyJWT; every call fails with AuthenticationUnavailableError,
    mapped by get_current_principal to 503, not a crash and not a 401 that
    would misleadingly imply the credential itself was checked and rejected."""

    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity:
        raise AuthenticationUnavailableError(
            "Identity verification is not configured in this environment."
        )


def get_identity_verifier(settings: Settings = Depends(get_settings)) -> IdentityVerifier:
    """Production default. Tests must override this dependency with
    FakeIdentityVerifier via app.dependency_overrides.

    Deliberately never raises: constructing the real ClerkIdentityVerifier
    (which sets up a PyJWKClient) only happens once Clerk is actually
    configured. When it isn't, this returns UnavailableIdentityVerifier — a
    request with no bearer token never even calls verify_bearer_token on it
    (get_current_principal returns 401 before that), so an unconfigured
    Clerk issuer never crashes a request that was never authenticated to
    begin with."""
    if not settings.clerk_issuer or not settings.clerk_authorized_parties:
        return UnavailableIdentityVerifier()
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
    except AuthenticationUnavailableError:
        raise HTTPException(
            status_code=503, detail="Authentication is temporarily unavailable."
        ) from None
    except InvalidBearerTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired credentials.") from None

    user = await provision_user(session, identity)

    # Verified Clerk identity is necessary but not sufficient: RepairScope
    # can still deny a suspended/deactivated account. This is 403, not 401
    # — the credential itself verified successfully; RepairScope's own
    # authorization layer is what's declining further use. provision_user
    # never touches `status` on an existing row (see provisioning.py), so
    # re-authenticating cannot reactivate a suspended user here.
    if user.status != UserStatus.active:
        raise ForbiddenError(f"User status is '{user.status.value}', not active.")

    return AuthenticatedPrincipal(
        clerk_user_id=identity.external_user_id,
        repairscope_user_id=user.id,
        email_verified=identity.email_verified,
    )
