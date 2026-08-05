# RepairScope API (backend)

FastAPI backend for RepairScope. See the [repository root README](../../README.md)
for the monorepo layout and [docs/CLAUDE_BACKEND_HANDOFF.md](../../docs/CLAUDE_BACKEND_HANDOFF.md)
for the integration boundary and phased implementation order this backend follows.

## Stack

- Python 3.13, managed with [uv](https://docs.astral.sh/uv/)
- FastAPI, Pydantic v2, pydantic-settings
- SQLAlchemy 2 (async, `asyncpg` driver)
- Alembic for migrations
- PostgreSQL
- pytest, pytest-asyncio, httpx, ruff

## Setup

```bash
cd apps/api
uv sync
cp .env.example .env   # edit if your local Postgres differs
```

Bring up local Postgres (see [infrastructure/](../../infrastructure)):

```bash
docker compose -f ../../infrastructure/docker-compose.yml up -d
```

## Run

```bash
uv run uvicorn app.main:app --reload
```

## Validation

```bash
uv run ruff check .
uv run pytest -q
```

## Health endpoints

- `GET /health/live` — process liveness only, does not touch the database.
- `GET /health/ready` — checks Postgres connectivity; returns 503 with
  `{"status": "unavailable", "dependency": "database"}` if the database is
  unreachable.

## Migrations

```bash
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

No migrations exist yet — Alembic is configured but Phase 1 intentionally
ships no application tables. The first real revision lands once the
user/auth/property foundation is designed (Phase 2).

## Configuration

Settings are read from environment variables prefixed `REPAIRSCOPE_` (see
`app/config.py`), with a local `.env` file as a convenience during
development. No secret belongs in this repository.

## Architecture

- `app/main.py` — FastAPI app, router registration
- `app/config.py` — `Settings` (pydantic-settings), `get_settings()`
- `app/db.py` — async SQLAlchemy engine, session factory, `Base` declarative
  base, `check_database_connection()`
- `app/routers/` — route modules (`health.py` so far)
- `migrations/` — Alembic environment and revisions
- `tests/` — pytest suite
