from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="REPAIRSCOPE_", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://repairscope:repairscope@localhost:5432/repairscope"


@lru_cache
def get_settings() -> Settings:
    return Settings()
