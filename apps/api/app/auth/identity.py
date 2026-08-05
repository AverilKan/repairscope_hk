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


class IdentityVerifier(Protocol):
    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity: ...
