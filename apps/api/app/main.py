import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.api.routes.repair_submissions import router as repair_submissions_router
from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError, NotFoundError

logger = logging.getLogger("repairscope.api")

app = FastAPI(title="RepairScope API")
app.include_router(health_router)
app.include_router(me_router)
app.include_router(repair_submissions_router)


def validate_production_auth_config(settings: Settings) -> None:
    """Fails application startup loudly when running as `production` without
    the configuration protected operator/landlord routes need — the same
    fail-closed philosophy as configure_cors's CORS check below, and
    deliberately separate from it so each missing piece gets its own clear
    error. Does nothing outside production: local/dev environments must stay
    able to exercise the public intake path without any Clerk configuration
    at all (see UnavailableIdentityVerifier in app/auth/dependencies.py)."""
    if settings.environment != "production":
        return

    missing = []
    if not settings.clerk_issuer:
        missing.append("REPAIRSCOPE_CLERK_ISSUER")
    if not settings.clerk_authorized_parties:
        missing.append("REPAIRSCOPE_CLERK_AUTHORIZED_PARTIES")
    if not settings.cors_allowed_origins_list():
        missing.append("REPAIRSCOPE_CORS_ALLOWED_ORIGINS")
    if settings.database_url == Settings.model_fields["database_url"].default:
        missing.append("REPAIRSCOPE_DATABASE_URL (still the local-development default)")

    if missing:
        raise RuntimeError(
            "Production startup requires the following to be explicitly "
            f"configured: {', '.join(missing)}."
        )


def configure_cors(application: FastAPI, settings: Settings) -> None:
    """Applies the CORS policy to `application`. Takes settings explicitly
    (rather than always reading the process-wide cached get_settings())
    so tests can exercise different origin configurations against a
    throwaway FastAPI instance without needing to clear the lru_cache."""
    allowed_origins = settings.cors_allowed_origins_list()

    if settings.environment == "production" and not allowed_origins:
        # Fail closed and loud at startup rather than silently serving
        # with no CORS policy (which would just mean every browser call
        # fails) or falling back to a permissive default (which would be
        # a real security hole).
        raise RuntimeError(
            "REPAIRSCOPE_CORS_ALLOWED_ORIGINS must be set to a non-empty, "
            "explicit origin list in production."
        )

    if not allowed_origins:
        # No browser origin configured (typical for local dev without a
        # frontend running yet, and for the backend test suite): add no
        # CORS middleware at all, rather than a permissive default.
        return

    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,  # bearer tokens only, never shared cookies
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )


class UnexpectedErrorMiddleware(BaseHTTPMiddleware):
    """Catches anything not already mapped to a specific response and
    returns a generic, CORS-safe 500.

    This is deliberately a middleware, not an `@app.exception_handler
    (Exception)` — Starlette's own Starlette.build_middleware_stack()
    special-cases any handler registered under the `Exception` (or `500`)
    key: it's pulled out of the normal handler dict and promoted to
    ServerErrorMiddleware, which sits *outside* every user middleware
    including CORSMiddleware. A response built there never passes back
    through CORSMiddleware, so the browser sees a bare 500 with no
    Access-Control-Allow-Origin header at all — indistinguishable from the
    request never reaching the server. Registering this as ordinary
    middleware *before* configure_cors's app.add_middleware(CORSMiddleware,
    ...) makes it the innermost of the two (Starlette wraps middleware in
    reverse registration order), i.e. positioned between CORSMiddleware and
    the router — so its response still flows back out through CORSMiddleware
    and gets the correct headers. Confirmed by direct inspection of
    Starlette 1.4.0's build_middleware_stack() and reproduced live: the
    @app.exception_handler(Exception) version returned 500 JSON with no
    CORS header; this version returns the same body with the header
    present."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            # Never include the exception message or any request data in
            # the response; the traceback goes to the server log only.
            logger.exception(
                "unhandled_exception path=%s method=%s", request.url.path, request.method
            )
            return JSONResponse(
                status_code=500, content={"detail": "An unexpected server error occurred."}
            )


def configure_error_handlers(application: FastAPI) -> None:
    """Registers every domain/generic exception handler on `application`.
    Extracted as its own function — same rationale as configure_cors — so
    tests can build a throwaway app with the exact same error behaviour
    instead of relying on the module-level `app` singleton. Must be called
    *before* configure_cors (see UnexpectedErrorMiddleware's docstring for
    why the ordering matters)."""

    @application.exception_handler(ForbiddenError)
    async def forbidden_error_handler(_request: Request, _exc: ForbiddenError) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": "Forbidden."})

    @application.exception_handler(NotFoundError)
    async def not_found_error_handler(_request: Request, _exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Not found."})

    application.add_middleware(UnexpectedErrorMiddleware)


validate_production_auth_config(get_settings())
# Order matters: Starlette's add_middleware() prepends to user_middleware,
# so the *last*-added middleware ends up outermost (closest to
# ServerErrorMiddleware) once the stack is built. configure_error_handlers
# must run first so CORSMiddleware, added second, ends up wrapping
# UnexpectedErrorMiddleware rather than the other way around — see
# UnexpectedErrorMiddleware's docstring.
configure_error_handlers(app)
configure_cors(app, get_settings())
