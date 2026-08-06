import pytest

from app.models.enums import Capability, CapabilitySource, UserStatus
from app.models.user import User
from app.services.admin import UnknownUserError, grant_capability


async def _make_user(db_session, clerk_user_id: str) -> User:
    user = User(clerk_user_id=clerk_user_id, status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_grant_capability_succeeds_for_a_known_user(db_session):
    user = await _make_user(db_session, "clerk_admin_1")
    grant = await grant_capability(db_session, user, Capability.operator)

    assert grant is not None
    assert grant.capability == Capability.operator
    assert grant.source == CapabilitySource.operator_grant


async def test_grant_capability_is_idempotent(db_session):
    user = await _make_user(db_session, "clerk_admin_2")
    first = await grant_capability(db_session, user, Capability.operator)
    second = await grant_capability(db_session, user, Capability.operator)

    assert first is not None
    assert second is None  # already active — no duplicate row, no error


async def test_grant_capability_refuses_an_unknown_user(db_session):
    with pytest.raises(UnknownUserError):
        await grant_capability(db_session, None, Capability.operator)


async def test_grant_capability_does_not_affect_other_capabilities(db_session):
    user = await _make_user(db_session, "clerk_admin_3")
    await grant_capability(db_session, user, Capability.landlord)
    await grant_capability(db_session, user, Capability.operator)

    from app.repositories.users import get_active_capabilities

    capabilities = {c.capability for c in await get_active_capabilities(db_session, user.id)}
    assert capabilities == {Capability.landlord, Capability.operator}


async def test_grant_capability_becomes_visible_through_get_me(client, fake_verifier, db_session):
    from app.auth.identity import VerifiedExternalIdentity

    user = await _make_user(db_session, "clerk_admin_4")
    await grant_capability(db_session, user, Capability.operator)

    fake_verifier.register(
        "admin-token", VerifiedExternalIdentity("clerk_admin_4", "admin@example.com", True)
    )
    response = await client.get("/api/me", headers={"Authorization": "Bearer admin-token"})

    assert response.status_code == 200
    assert [c["capability"] for c in response.json()["capabilities"]] == ["operator"]
