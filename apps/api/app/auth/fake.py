from app.auth.identity import IdentityVerifier, InvalidBearerTokenError, VerifiedExternalIdentity


class FakeIdentityVerifier(IdentityVerifier):
    """Deterministic test double: bearer tokens are opaque keys into a
    dict of pre-registered identities, not real JWTs. Lets tests exercise
    the full auth boundary (dependency -> provisioning -> principal)
    without calling Clerk."""

    def __init__(self, identities: dict[str, VerifiedExternalIdentity] | None = None):
        self._identities = dict(identities or {})

    def register(self, token: str, identity: VerifiedExternalIdentity) -> None:
        self._identities[token] = identity

    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity:
        try:
            return self._identities[token]
        except KeyError:
            raise InvalidBearerTokenError(f"Unknown fake token: {token!r}") from None
