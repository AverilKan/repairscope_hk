import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.auth.dependencies import get_identity_verifier
from app.auth.fake import FakeIdentityVerifier
from app.core.db import _session_factory
from app.main import app

_IDENTITY_TABLES = (
    "property_access_grants",
    "user_capabilities",
    "account_memberships",
    "properties",
    "accounts",
    "users",
    "repair_submissions",
)


@pytest.fixture(autouse=True)
async def _clean_identity_tables():
    """Integration tests below hit real Postgres (see infrastructure/
    docker-compose.yml) rather than mocking the database, per the project's
    preference for verifying real constraint/migration behaviour. Truncate
    after each test so tests don't depend on execution order."""
    yield
    async with _session_factory() as session:
        await session.execute(
            text(f"TRUNCATE {', '.join(_IDENTITY_TABLES)} RESTART IDENTITY CASCADE")
        )
        await session.commit()


@pytest.fixture
def fake_verifier() -> FakeIdentityVerifier:
    return FakeIdentityVerifier()


@pytest.fixture
async def client(fake_verifier: FakeIdentityVerifier):
    app.dependency_overrides[get_identity_verifier] = lambda: fake_verifier
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client:
        yield http_client
    app.dependency_overrides.pop(get_identity_verifier, None)


@pytest.fixture
async def db_session():
    async with _session_factory() as session:
        yield session
