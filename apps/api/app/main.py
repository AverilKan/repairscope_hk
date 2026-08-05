from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError, NotFoundError

app = FastAPI(title="RepairScope API")
app.include_router(health_router)
app.include_router(me_router)


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
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )


configure_cors(app, get_settings())


@app.exception_handler(ForbiddenError)
async def forbidden_error_handler(_request: Request, _exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": "Forbidden."})


@app.exception_handler(NotFoundError)
async def not_found_error_handler(_request: Request, _exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Not found."})
