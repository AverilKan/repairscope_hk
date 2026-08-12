import asyncio
import pathlib

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.core.db import create_engine

API_ROOT = pathlib.Path(__file__).resolve().parent.parent

# This migration (c1a9f0e4d7b3) makes repair_submissions.property_postcode
# nullable, because Hong Kong properties have no postcode system. Its
# downgrade cannot safely re-apply NOT NULL once a real HK row with a NULL
# postcode exists — there is no truthful value to invent. See the
# migration's own downgrade() for the chosen policy: refuse with a clear
# error rather than either inventing a fake postcode or letting a bare
# SQL NOT NULL failure stand in for an intentional decision.

pytestmark = pytest.mark.filterwarnings("ignore")

REVISION = "c1a9f0e4d7b3"
PARENT_REVISION = "982c0f4fed62"


def _alembic_config() -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    return config


def _run(coro):
    return asyncio.run(coro)


def _insert_hk_row_with_null_postcode() -> None:
    async def _insert() -> None:
        engine = create_engine()
        try:
            async with engine.begin() as connection:
                await connection.execute(
                    sa.text(
                        """
                        INSERT INTO repair_submissions (
                            id, public_reference, status,
                            questionnaire_version, issue_category,
                            questionnaire_answers, generated_brief, safety_flags,
                            landlord_name, landlord_email, landlord_phone,
                            property_postcode, property_address,
                            preferred_contact_method,
                            consent_to_contact, consent_to_share_with_contractors,
                            created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(), 'HK-TEST-0001', 'new',
                            'v1', 'leak',
                            '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
                            'Test Owner', 'owner@example.com', '+852 0000 0000',
                            NULL, 'Eastern District, Test Estate',
                            'email',
                            true, false,
                            now(), now()
                        )
                        """
                    )
                )
        finally:
            await engine.dispose()

    _run(_insert())


def _table_names() -> set[str]:
    async def _inspect() -> set[str]:
        engine = create_engine()
        try:
            async with engine.connect() as connection:
                return set(
                    await connection.run_sync(
                        lambda conn: sa.inspect(conn).get_table_names()
                    )
                )
        finally:
            await engine.dispose()

    return _run(_inspect())


def test_upgrade_makes_property_postcode_nullable():
    config = _alembic_config()
    command.upgrade(config, "head")

    async def _is_nullable() -> bool:
        engine = create_engine()
        try:
            async with engine.connect() as connection:
                columns = await connection.run_sync(
                    lambda conn: sa.inspect(conn).get_columns("repair_submissions")
                )
        finally:
            await engine.dispose()
        return next(c["nullable"] for c in columns if c["name"] == "property_postcode")

    assert _run(_is_nullable()) is True


def test_downgrade_succeeds_on_a_database_with_no_null_postcode_rows():
    config = _alembic_config()
    command.upgrade(config, "head")
    assert "repair_submissions" in _table_names()

    # Empty table — no NULL-postcode rows exist, so the downgrade's safety
    # check finds nothing to refuse and proceeds normally.
    command.downgrade(config, PARENT_REVISION)

    async def _is_not_null() -> bool:
        engine = create_engine()
        try:
            async with engine.connect() as connection:
                columns = await connection.run_sync(
                    lambda conn: sa.inspect(conn).get_columns("repair_submissions")
                )
        finally:
            await engine.dispose()
        return not next(c["nullable"] for c in columns if c["name"] == "property_postcode")

    assert _run(_is_not_null()) is True

    # Leave the schema at head for every other test in the suite.
    command.upgrade(config, "head")


def test_downgrade_refuses_when_a_null_postcode_hk_row_exists():
    config = _alembic_config()
    command.upgrade(config, "head")

    _insert_hk_row_with_null_postcode()

    with pytest.raises(RuntimeError, match="NULL property_postcode"):
        command.downgrade(config, PARENT_REVISION)

    # The refusal must not have altered the column, and the offending row
    # must not have been silently dropped or backfilled with a fake value.
    async def _check() -> tuple[bool, str | None]:
        engine = create_engine()
        try:
            async with engine.connect() as connection:
                columns = await connection.run_sync(
                    lambda conn: sa.inspect(conn).get_columns("repair_submissions")
                )
                nullable = next(c["nullable"] for c in columns if c["name"] == "property_postcode")
                result = await connection.execute(
                    sa.text(
                        "SELECT property_postcode FROM repair_submissions "
                        "WHERE public_reference = 'HK-TEST-0001'"
                    )
                )
                row = result.first()
                return nullable, (row[0] if row else "MISSING")
        finally:
            await engine.dispose()

    nullable, stored_postcode = _run(_check())
    assert nullable is True
    assert stored_postcode is None

    # Clean up and leave the schema at head for every other test in the suite.
    async def _cleanup() -> None:
        engine = create_engine()
        try:
            async with engine.begin() as connection:
                await connection.execute(
                    sa.text(
                        "DELETE FROM repair_submissions WHERE public_reference = 'HK-TEST-0001'"
                    )
                )
        finally:
            await engine.dispose()

    _run(_cleanup())
    command.upgrade(config, "head")
