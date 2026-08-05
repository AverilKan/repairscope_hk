from datetime import UTC, datetime

from app.auth.identity import VerifiedExternalIdentity
from app.models.account import Account, AccountMembership
from app.models.enums import (
    AccountRole,
    AccountStatus,
    AccountType,
    Capability,
    CapabilitySource,
    CapabilityStatus,
    MembershipStatus,
    UserStatus,
)
from app.models.user import User, UserCapability


async def _make_user(db_session, clerk_user_id: str) -> User:
    user = User(clerk_user_id=clerk_user_id, status=UserStatus.active)
    db_session.add(user)
    await db_session.flush()
    await db_session.commit()
    return user


async def test_invalid_bearer_token_returns_401(client, fake_verifier):
    response = await client.get("/api/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


async def test_missing_bearer_token_returns_401(client):
    response = await client.get("/api/me")
    assert response.status_code == 401


async def test_active_landlord_capability_is_returned_by_get_me(client, fake_verifier, db_session):
    user = await _make_user(db_session, "clerk_landlord")
    db_session.add(
        UserCapability(
            user_id=user.id,
            capability=Capability.landlord,
            status=CapabilityStatus.active,
            source=CapabilitySource.signup,
            granted_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    fake_verifier.register(
        "token", VerifiedExternalIdentity("clerk_landlord", "l@example.com", True)
    )
    response = await client.get("/api/me", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert [c["capability"] for c in capabilities] == ["landlord"]


async def test_revoked_capability_is_not_returned_as_active(client, fake_verifier, db_session):
    user = await _make_user(db_session, "clerk_revoked")
    db_session.add(
        UserCapability(
            user_id=user.id,
            capability=Capability.landlord,
            status=CapabilityStatus.revoked,
            source=CapabilitySource.signup,
            granted_at=datetime.now(UTC),
            revoked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    fake_verifier.register(
        "token", VerifiedExternalIdentity("clerk_revoked", "r@example.com", True)
    )
    response = await client.get("/api/me", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    assert response.json()["capabilities"] == []


async def test_one_user_may_hold_both_landlord_and_contractor_capabilities(
    client, fake_verifier, db_session
):
    user = await _make_user(db_session, "clerk_dual")
    db_session.add_all(
        [
            UserCapability(
                user_id=user.id,
                capability=Capability.landlord,
                status=CapabilityStatus.active,
                source=CapabilitySource.signup,
                granted_at=datetime.now(UTC),
            ),
            UserCapability(
                user_id=user.id,
                capability=Capability.contractor,
                status=CapabilityStatus.active,
                source=CapabilitySource.invitation,
                granted_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.commit()

    fake_verifier.register("token", VerifiedExternalIdentity("clerk_dual", "d@example.com", True))
    response = await client.get("/api/me", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    granted = {c["capability"] for c in response.json()["capabilities"]}
    assert granted == {"landlord", "contractor"}


async def test_client_supplied_capability_claims_are_ignored(client, fake_verifier, db_session):
    """A client cannot grant itself a capability by merely claiming one —
    only rows in user_capabilities (created server-side) count."""
    await _make_user(db_session, "clerk_claim")
    fake_verifier.register("token", VerifiedExternalIdentity("clerk_claim", "c@example.com", True))

    response = await client.get(
        "/api/me",
        headers={
            "Authorization": "Bearer token",
            # No route reads this — included to prove a claimed capability
            # header has zero effect on the response.
            "X-RepairScope-Capabilities": "operator,landlord",
        },
    )

    assert response.status_code == 200
    assert response.json()["capabilities"] == []


async def test_get_me_does_not_expose_secret_or_internal_fields(client, fake_verifier, db_session):
    user = await _make_user(db_session, "clerk_safe")
    account = Account(
        name="Acme", account_type=AccountType.letting_agent, status=AccountStatus.active
    )
    db_session.add(account)
    await db_session.flush()
    db_session.add(
        AccountMembership(
            account_id=account.id,
            user_id=user.id,
            role=AccountRole.owner,
            status=MembershipStatus.active,
        )
    )
    await db_session.commit()

    fake_verifier.register("token", VerifiedExternalIdentity("clerk_safe", "s@example.com", True))
    response = await client.get("/api/me", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "id",
        "display_name",
        "primary_email",
        "capabilities",
        "account_memberships",
    }
    for capability in body["capabilities"]:
        assert set(capability.keys()) == {"capability", "source", "granted_at"}
    for membership in body["account_memberships"]:
        assert set(membership.keys()) == {"account_id", "account_name", "role"}
        # No internal fields such as clerk_user_id, granted_by_user_id,
        # status, or raw capability/membership row ids leak through.
        assert "clerk_user_id" not in body
        assert "status" not in membership
