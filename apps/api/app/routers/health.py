from fastapi import APIRouter, Response

from app.db import check_database_connection

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(response: Response) -> dict[str, str]:
    try:
        await check_database_connection()
    except Exception:
        response.status_code = 503
        return {"status": "unavailable", "dependency": "database"}
    return {"status": "ok"}
