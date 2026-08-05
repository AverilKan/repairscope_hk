from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="REPAIRSCOPE_", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://repairscope:repairscope@localhost:5432/repairscope"

    # Clerk issues RS256-signed JWTs; verification fetches the issuer's JWKS
    # rather than storing a static key. Unset in local/test environments,
    # which use the FakeIdentityVerifier instead — see app/auth/dependencies.py.
    clerk_issuer: str | None = None

    # Comma-separated allowed frontend origins, checked against a token's
    # azp claim when present. Per Clerk's own documented guidance, an azp
    # claim that doesn't match one of these is rejected; a token with no
    # azp claim at all is not rejected on that basis (Clerk does not always
    # include it) — see app/auth/clerk.py for the enforcement logic.
    clerk_authorized_parties: str | None = None

    # Leave unset unless your Clerk instance issues an `aud` claim you need
    # enforced. When unset, audience is not requested from PyJWT at all —
    # a token carrying an aud claim is still accepted (see clerk.py).
    clerk_audience: str | None = None

    # Clock-skew tolerance (seconds) applied to exp/nbf checks.
    clerk_clock_skew_seconds: int = 10


@lru_cache
def get_settings() -> Settings:
    return Settings()
