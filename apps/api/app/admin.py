"""Administrative commands run from the backend environment, never exposed
over HTTP. Currently just capability granting — the minimum needed to
provision the first RepairScope operator without a public API that could
do the same thing.

Usage:
    uv run python -m app.admin grant-capability \
        --user-id <repairscope-user-id> --capability operator
    uv run python -m app.admin grant-capability \
        --clerk-user-id <clerk-external-id> --capability operator
"""

import argparse
import asyncio
import sys
import uuid

from app.core.db import _session_factory
from app.models.enums import Capability
from app.repositories.users import get_user_by_clerk_user_id, get_user_by_id
from app.services.admin import UnknownUserError, grant_capability


def _mask_email(email: str | None) -> str:
    if not email or "@" not in email:
        return "(no email on file)"
    local, _, domain = email.partition("@")
    visible = local[:2]
    return f"{visible}{'*' * max(len(local) - len(visible), 1)}@{domain}"


async def _run_grant_capability(
    user_id: str | None, clerk_user_id: str | None, capability: str
) -> int:
    capability_enum = Capability(capability)  # argparse choices= already validated this

    async with _session_factory() as session:
        if user_id is not None:
            try:
                parsed_id = uuid.UUID(user_id)
            except ValueError:
                print(f"'{user_id}' is not a valid RepairScope user ID.", file=sys.stderr)
                return 1
            user = await get_user_by_id(session, parsed_id)
        else:
            user = await get_user_by_clerk_user_id(session, clerk_user_id)  # type: ignore[arg-type]

        try:
            grant = await grant_capability(session, user, capability_enum)
        except UnknownUserError:
            identifier = user_id or clerk_user_id
            print(
                f"No RepairScope user found for '{identifier}'. They must sign in at "
                "least once (so a user row exists via JIT provisioning) before this "
                "command can find them.",
                file=sys.stderr,
            )
            return 1

        # grant_capability only raises UnknownUserError when user is None, so
        # reaching here means the lookup above succeeded.
        assert user is not None

    masked = _mask_email(user.primary_email)
    if grant is None:
        print(
            f"User {user.id} ({masked}) already has an active '{capability_enum.value}' "
            "capability. No change made."
        )
    else:
        print(f"Granted '{capability_enum.value}' to user {user.id} ({masked}).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.admin")
    subparsers = parser.add_subparsers(dest="command", required=True)

    grant_parser = subparsers.add_parser(
        "grant-capability", help="Grant a capability to an existing RepairScope user."
    )
    identifier_group = grant_parser.add_mutually_exclusive_group(required=True)
    identifier_group.add_argument("--user-id", help="Existing RepairScope user ID (UUID).")
    identifier_group.add_argument(
        "--clerk-user-id", help="Clerk external user ID of an already-provisioned user."
    )
    grant_parser.add_argument(
        "--capability",
        required=True,
        choices=[c.value for c in Capability],
        help="Capability to grant.",
    )

    args = parser.parse_args(argv)

    if args.command == "grant-capability":
        return asyncio.run(_run_grant_capability(args.user_id, args.clerk_user_id, args.capability))
    return 1  # pragma: no cover - unreachable, argparse enforces `command`


if __name__ == "__main__":
    raise SystemExit(main())
