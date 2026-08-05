import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.auth.dependencies import get_identity_verifier
from app.auth.fake import FakeIdentityVerifier
from app.core.config import Settings
from app.main import configure_cors

ALLOWED_ORIGIN = "http://localhost:3000"
OTHER_ORIGIN = "http://localhost:3001"


def _build_app(**settings_kwargs) -> FastAPI:
    """A throwaway app, independent of the module-level `app` singleton in
    app.main, so each test can exercise a different CORS configuration
    without needing to touch the process-wide cached get_settings(). The
    identity verifier is overridden with a fake, same as conftest's
    `client` fixture, so hitting /api/me doesn't depend on a real
    (test-environment-unconfigured) ClerkIdentityVerifier."""
    application = FastAPI()
    application.include_router(health_router)
    application.include_router(me_router)
    configure_cors(application, Settings(**settings_kwargs))
    application.dependency_overrides[get_identity_verifier] = FakeIdentityVerifier
    return application


@pytest.fixture
async def cors_client():
    app = _build_app(cors_allowed_origins=ALLOWED_ORIGIN)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_allowed_origin_receives_cors_response(cors_client):
    response = await cors_client.get("/health/live", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_unknown_origin_is_not_granted_access(cors_client):
    response = await cors_client.get("/health/live", headers={"Origin": OTHER_ORIGIN})
    assert response.status_code == 200  # request itself succeeds (no browser to block it)
    # ...but no CORS header authorizes the browser to read the response.
    assert "access-control-allow-origin" not in response.headers


async def test_authorization_header_is_permitted_in_preflight(cors_client):
    response = await cors_client.options(
        "/api/me",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    allowed_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allowed_headers


async def test_required_methods_are_permitted(cors_client):
    response = await cors_client.options(
        "/api/me",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    allowed_methods = response.headers.get("access-control-allow-methods", "")
    assert "GET" in allowed_methods
    assert "POST" in allowed_methods


def test_wildcard_origin_is_rejected_at_configuration_time():
    with pytest.raises(ValueError, match="wildcard"):
        Settings(cors_allowed_origins="*").cors_allowed_origins_list()

    with pytest.raises(ValueError, match="wildcard"):
        Settings(cors_allowed_origins=f"{ALLOWED_ORIGIN},*").cors_allowed_origins_list()


def test_production_without_configured_origins_fails_at_startup():
    app = FastAPI()
    with pytest.raises(RuntimeError, match="CORS_ALLOWED_ORIGINS"):
        configure_cors(app, Settings(environment="production", cors_allowed_origins=None))


def test_no_cors_middleware_added_when_unconfigured_outside_production():
    app = FastAPI()
    configure_cors(app, Settings(environment="development", cors_allowed_origins=None))
    # No CORSMiddleware in the stack at all — same as before this feature
    # existed, not a permissive fallback.
    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" not in middleware_classes


async def test_health_endpoints_remain_available_with_cors_configured(cors_client):
    response = await cors_client.get("/health/live")  # no Origin header at all
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_cors_configuration_does_not_weaken_authentication(cors_client):
    # Even from an allowed origin, /api/me still requires a valid bearer
    # token — CORS only controls which origins may read the response, it
    # is not an authentication mechanism.
    response = await cors_client.get("/api/me", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 401
