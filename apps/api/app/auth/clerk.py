import httpx
import jwt
from jwt import PyJWKClient

from app.auth.identity import IdentityVerifier, InvalidBearerTokenError, VerifiedExternalIdentity
from app.core.config import Settings

_JWKS_CLIENT_CACHE_SECONDS = 300


class ClerkIdentityVerifier(IdentityVerifier):
    """Verifies a Clerk session JWT by fetching Clerk's issuer JWKS and
    validating the RS256 signature, issuer and expiry. Not exercised
    against a real Clerk tenant in Phase 2 — there is no Clerk account
    configured for this project yet — but the verification logic itself
    (signature, issuer, expiry, audience) is real, not a stub, so wiring in
    real `clerk_issuer`/`clerk_audience` settings later needs no code
    change here.
    """

    def __init__(self, settings: Settings):
        if not settings.clerk_issuer:
            raise ValueError(
                "ClerkIdentityVerifier requires REPAIRSCOPE_CLERK_ISSUER to be set."
            )
        self._issuer = settings.clerk_issuer
        self._audience = settings.clerk_audience
        self._jwks_client = PyJWKClient(
            f"{self._issuer.rstrip('/')}/.well-known/jwks.json",
            cache_keys=True,
            lifespan=_JWKS_CLIENT_CACHE_SECONDS,
        )

    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self._issuer,
                audience=self._audience,
                options={"require": ["exp", "iat", "sub"]},
            )
        except (jwt.PyJWTError, httpx.HTTPError, KeyError) as error:
            raise InvalidBearerTokenError(str(error)) from error

        subject = claims.get("sub")
        if not subject or not isinstance(subject, str):
            raise InvalidBearerTokenError("Token is missing a subject claim.")

        email = claims.get("email")
        email_verified = bool(claims.get("email_verified", False))
        return VerifiedExternalIdentity(
            external_user_id=subject,
            email=email if isinstance(email, str) else None,
            email_verified=email_verified,
        )

