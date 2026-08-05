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
uv run alembic downgrade -1   # or `base` to drop everything
```

Revision `8ed561c12765` ("add identity and property foundation") is the
first real migration: `users`, `user_capabilities`, `accounts`,
`account_memberships`, `properties`, `property_access_grants`. Every enum
column is `Enum(..., native_enum=False, create_constraint=True)` — a
`VARCHAR` with a real Postgres `CHECK` constraint, not a native enum type
(avoids `ALTER TYPE ... ADD VALUE` migration pain later). Verified: empty
DB → upgrade head → downgrade to base (clean) → upgrade head again.

Known tooling quirk: `uv run alembic check` reports a false-positive
"removed check constraint" diff for every `Enum`-derived `CHECK`
constraint, immediately after a migration that matches the models exactly.
This is a limitation in Alembic's check-constraint reflection comparator
(it can't structurally parse the constraint body back from Postgres), not
an actual drift — confirmed by inspecting the live constraints directly
(`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE
contype = 'c' AND conrelid = '<table>'::regclass;`). Don't "fix" this by
autogenerating a migration that drops and re-adds these constraints.

## Configuration

Settings are read from environment variables prefixed `REPAIRSCOPE_` (see
`app/core/config.py`), with a local `.env` file as a convenience during
development. No secret belongs in this repository.

## Architecture

- `app/main.py` — FastAPI app, router registration
- `app/core/` — `config.py` (`Settings`, `get_settings()`), `db.py` (async
  SQLAlchemy engine, session factory, `Base`, `check_database_connection()`)
- `app/api/routes/` — route modules (`health.py` so far)
- `app/auth/` — identity verification and the `AuthenticatedPrincipal`
  boundary (Phase 2)
- `app/models/` — SQLAlchemy ORM models, one module per aggregate
  (`user.py`, `account.py`, `property.py`), `enums.py` for shared
  `StrEnum`s, `base.py` for `UUIDPrimaryKeyMixin`/`TimestampMixin`
- `app/repositories/` — data-access layer over the models (Phase 2)
- `app/services/` — business/authorization logic, e.g. the central
  authorization service (Phase 2)
- `app/schemas/` — Pydantic request/response models, kept separate from
  the SQLAlchemy persistence models in `app/models/`
- `migrations/` — Alembic environment and revisions
- `tests/` — pytest suite
