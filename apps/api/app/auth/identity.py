from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class VerifiedExternalIdentity:
    """What a verified bearer token tells us — nothing more. This is the
    only thing an IdentityVerifier is trusted to produce; everything else
    (capabilities, memberships, permissions) is derived server-side from
    it, never accepted from the request itself."""

    external_user_id: str
    email: str | None
    email_verified: bool


class InvalidBearerTokenError(Exception):
    """Raised for any bearer token that isn't a currently-valid identity:
    missing, malformed, expired or otherwise unverifiable. Callers map this
    to 401, without distinguishing the exact reason to the client."""


class AuthenticationUnavailableError(Exception):
    """Raised when a bearer token was presented but identity verification
    itself is not configured/available (e.g. REPAIRSCOPE_CLERK_ISSUER unset
    in a local/dev environment). Distinct from InvalidBearerTokenError: the
    credential was never actually evaluated, so this is not "invalid or
    expired" (401) but "the service can't check right now" (503). Callers
    must not construct a real ClerkIdentityVerifier or attempt any network
    call to reach this state — see UnavailableIdentityVerifier."""


class IdentityVerifier(Protocol):
    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity: ...
