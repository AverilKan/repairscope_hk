import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_live_does_not_touch_the_database():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ready_reports_ok_when_database_is_reachable(monkeypatch):
    async def fake_check() -> bool:
        return True

    monkeypatch.setattr("app.api.routes.health.check_database_connection", fake_check)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ready_reports_unavailable_when_database_is_unreachable(monkeypatch):
    async def fake_check() -> bool:
        raise ConnectionError("database unreachable")

    monkeypatch.setattr("app.api.routes.health.check_database_connection", fake_check)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "dependency": "database"}
