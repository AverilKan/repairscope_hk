import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.auth.dependencies import UnavailableIdentityVerifier, get_identity_verifier
from app.auth.fake import FakeIdentityVerifier
from app.core.config import Settings
from app.core.db import get_session
from app.main import configure_cors, configure_error_handlers

ALLOWED_ORIGIN = "http://localhost:3000"


def _build_app(**settings_kwargs) -> FastAPI:
    """Throwaway app mirroring test_cors.py's _build_app — same CORS
    configuration plus this task's generic-exception handler, independent
    of the module-level `app` singleton and its process-wide get_settings()
    cache."""
    application = FastAPI()
    application.include_router(health_router)
    application.include_router(me_router)
    # Order matters — see app.main's own call site for why.
    configure_error_handlers(application)
    configure_cors(application, Settings(cors_allowed_origins=ALLOWED_ORIGIN, **settings_kwargs))
    return application


@pytest.fixture
async def app_client():
    application = _build_app()
    # raise_app_exceptions=False: this file deliberately triggers server
    # errors to assert on the *response* the generic handler produces —
    # httpx's default of re-raising them (a debugging aid) would defeat
    # that for exactly the tests that need it most.
    async with AsyncClient(
        transport=ASGITransport(app=application, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        yield client, application


async def test_missing_token_returns_401_without_constructing_a_real_verifier(app_client):
    client, _application = app_client
    # No dependency override at all — get_identity_verifier runs for real,
    # unconfigured (no REPAIRSCOPE_CLERK_ISSUER in the test Settings above).
    # If it tried to construct a real ClerkIdentityVerifier or reach the
    # network, this would raise instead of returning cleanly.
    response = await client.get("/api/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token."}


async def test_invalid_token_still_returns_401_when_verifier_is_configured(app_client):
    client, application = app_client
    application.dependency_overrides[get_identity_verifier] = lambda: FakeIdentityVerifier()
    response = await client.get("/api/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired credentials."}


async def test_token_present_but_auth_unavailable_returns_503_not_500(app_client):
    client, application = app_client
    application.dependency_overrides[get_identity_verifier] = lambda: UnavailableIdentityVerifier()
    response = await client.get("/api/me", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Authentication is temporarily unavailable."}


async def _broken_session():
    # Test-only dependency substitution (not a permanent endpoint) — swaps
    # get_session (a dependency of get_current_principal, used by /api/me)
    # for one that always raises, to exercise the generic handler exactly
    # as a real unexpected failure would, without adding any new route.
    raise RuntimeError("a very specific internal detail that must never reach the client")
    yield  # pragma: no cover - unreachable, keeps this an async generator


async def test_unexpected_exception_returns_generic_500_without_internal_detail(app_client):
    client, application = app_client
    application.dependency_overrides[get_session] = _broken_session
    response = await client.get(
        "/api/me", headers={"Authorization": "Bearer x", "Origin": ALLOWED_ORIGIN}
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "An unexpected server error occurred."}
    body_text = response.text
    assert "a very specific internal detail" not in body_text
    assert "RuntimeError" not in body_text
    assert "Traceback" not in body_text


async def test_unexpected_exception_response_still_carries_cors_headers(app_client):
    client, application = app_client
    application.dependency_overrides[get_session] = _broken_session
    response = await client.get(
        "/api/me", headers={"Authorization": "Bearer x", "Origin": ALLOWED_ORIGIN}
    )

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_unexpected_exception_response_omits_cors_header_for_unknown_origin(app_client):
    client, application = app_client
    application.dependency_overrides[get_session] = _broken_session
    response = await client.get(
        "/api/me", headers={"Authorization": "Bearer x", "Origin": "http://evil.example"}
    )

    assert response.status_code == 500
    assert "access-control-allow-origin" not in response.headers


def test_production_startup_fails_without_full_auth_configuration():
    from app.main import validate_production_auth_config

    # Explicitly None every field this checks, rather than relying on
    # Settings() picking up nothing — Settings reads env_file=".env", so a
    # bare Settings(environment="production") is only "unconfigured" when
    # no local apps/api/.env happens to exist on the machine running the
    # test. That's exactly the ambient state this project's own .env.local
    # files are designed to vary (see apps/api/.env.example) — a test must
    # not depend on it.
    with pytest.raises(RuntimeError, match="REPAIRSCOPE_CLERK_ISSUER"):
        validate_production_auth_config(
            Settings(
                environment="production",
                clerk_issuer=None,
                clerk_authorized_parties=None,
                cors_allowed_origins=None,
            )
        )


def test_production_startup_succeeds_with_full_auth_configuration():
    from app.main import validate_production_auth_config

    validate_production_auth_config(
        Settings(
            environment="production",
            clerk_issuer="https://example.clerk.accounts.dev",
            clerk_authorized_parties="https://repairscope.example",
            cors_allowed_origins="https://repairscope.example",
            database_url="postgresql+asyncpg://prod:prod@prod-host:5432/repairscope",
        )
    )


def test_development_startup_does_not_require_clerk_configuration():
    from app.main import validate_production_auth_config

    # Must not raise — local/dev must stay able to run the public intake
    # path with zero Clerk configuration.
    validate_production_auth_config(Settings(environment="development"))
