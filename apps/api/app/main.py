from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.core.errors import ForbiddenError, NotFoundError

app = FastAPI(title="RepairScope API")
app.include_router(health_router)
app.include_router(me_router)


@app.exception_handler(ForbiddenError)
async def forbidden_error_handler(_request: Request, _exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": "Forbidden."})


@app.exception_handler(NotFoundError)
async def not_found_error_handler(_request: Request, _exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Not found."})
