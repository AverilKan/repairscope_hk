import asyncio
import pathlib

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect as sa_inspect

from app.core.db import create_engine

API_ROOT = pathlib.Path(__file__).resolve().parent.parent

EXPECTED_TABLES = {
    "users",
    "user_capabilities",
    "accounts",
    "account_memberships",
    "properties",
    "property_access_grants",
    "alembic_version",
}

# Alembic's `command.*` entry points are synchronous and internally manage
# their own event loop (see migrations/env.py's asyncio.run). Calling them
# from an async test (which already has pytest-asyncio's loop running)
# raises "asyncio.run() cannot be called from a running event loop" — these
# two tests are deliberately plain `def`, not `async def`.
pytestmark = pytest.mark.filterwarnings("ignore")


def _alembic_config() -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    return config


def _table_names() -> set[str]:
    async def _inspect() -> set[str]:
        engine = create_engine()
        try:
            async with engine.connect() as connection:
                return set(
                    await connection.run_sync(lambda conn: sa_inspect(conn).get_table_names())
                )
        finally:
            await engine.dispose()

    return asyncio.run(_inspect())


def test_migration_upgrades_from_empty_database():
    config = _alembic_config()
    command.downgrade(config, "base")
    assert _table_names() <= {"alembic_version"}

    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= _table_names()


def test_migration_downgrades_cleanly():
    config = _alembic_config()
    command.upgrade(config, "head")  # ensure we start from head regardless of test order
    assert EXPECTED_TABLES <= _table_names()

    command.downgrade(config, "base")
    assert _table_names() <= {"alembic_version"}

    # Leave the schema at head for every other test in the suite.
    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= _table_names()
