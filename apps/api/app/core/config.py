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
    clerk_audience: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
