from app.config import Settings, get_settings


def test_settings_have_sensible_local_defaults():
    settings = Settings()
    assert settings.environment == "development"
    assert settings.database_url.startswith("postgresql+asyncpg://")


def test_settings_are_cached():
    assert get_settings() is get_settings()


def test_settings_read_repairscope_prefixed_env_vars(monkeypatch):
    monkeypatch.setenv("REPAIRSCOPE_ENVIRONMENT", "test")
    assert Settings().environment == "test"
