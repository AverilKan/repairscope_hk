from datetime import UTC, datetime

from app.auth.identity import VerifiedExternalIdentity
from app.models.enums import Capability, CapabilitySource, CapabilityStatus, UserStatus
from app.models.user import User, UserCapability

_VALID_PAYLOAD = {
    "questionnaire_version": "v1",
    "issue_category": "plumbing-leak",
    "questionnaire_answers": {"leak_type": "dripping"},
    "generated_brief": {"reportedFacts": ["Tap drips overnight."]},
    "safety_flags": [],
    "landlord_name": "Jamie Landlord",
    "landlord_email": "jamie@example.com",
    "landlord_phone": "07700900000",
    "property_postcode": "WD17",
    "property_address": None,
    "preferred_contact_method": "email",
    "access_notes": None,
    "consent_to_contact": True,
    "consent_to_share_with_contractors": True,
}


async def test_broad_issue_types_can_all_reach_brief_creation(client):
    for category in ["plumbing-leak", "electrical", "general-maintenance", "existing-quote"]:
        response = await client.post(
            "/api/repair-submissions", json={**_VALID_PAYLOAD, "issue_category": category}
        )
        assert response.status_code == 201, response.text


async def test_minor_looking_problems_are_not_automatically_rejected(client):
    minor_payload = {
        **_VALID_PAYLOAD,
        "generated_brief": {"reportedFacts": ["One loose screw on a cupboard door."]},
    }
    response = await client.post("/api/repair-submissions", json=minor_payload)
    assert response.status_code == 201


async def test_safety_flags_are_persisted(client, db_session):
    payload = {**_VALID_PAYLOAD, "safety_flags": ["water_uncontrolled"]}
    response = await client.post("/api/repair-submissions", json=payload)
    assert response.status_code == 201
    reference = response.json()["public_reference"]

    from app.repositories.repair_submissions import get_submission_by_reference

    submission = await get_submission_by_reference(db_session, reference)
    assert submission.safety_flags == ["water_uncontrolled"]


async def test_no_account_is_required_to_submit(client):
    response = await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    assert response.status_code == 201


async def test_consent_to_contact_false_is_rejected(client):
    payload = {**_VALID_PAYLOAD, "consent_to_contact": False}
    response = await client.post("/api/repair-submissions", json=payload)
    assert response.status_code == 422


async def test_consent_to_share_with_contractors_may_be_false(client):
    payload = {**_VALID_PAYLOAD, "consent_to_share_with_contractors": False}
    response = await client.post("/api/repair-submissions", json=payload)
    assert response.status_code == 201


async def test_public_submission_is_persisted(client, db_session):
    response = await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    reference = response.json()["public_reference"]

    from app.repositories.repair_submissions import get_submission_by_reference

    submission = await get_submission_by_reference(db_session, reference)
    assert submission is not None
    assert submission.landlord_email == "jamie@example.com"


async def test_internal_status_cannot_be_set_by_the_public_request(client):
    payload = {**_VALID_PAYLOAD, "status": "pursuing"}
    response = await client.post("/api/repair-submissions", json=payload)
    assert response.status_code == 422


async def test_successful_submission_returns_a_reference(client):
    response = await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    body = response.json()
    assert body["public_reference"].startswith("RS-")
    assert body["status"] == "new"


async def _make_operator(db_session, clerk_user_id: str) -> User:
    user = User(clerk_user_id=clerk_user_id, status=UserStatus.active)
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        UserCapability(
            user_id=user.id,
            capability=Capability.operator,
            status=CapabilityStatus.active,
            source=CapabilitySource.system,
            granted_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    return user


async def _authed_headers(fake_verifier, db_session, clerk_user_id: str) -> dict:
    await _make_operator(db_session, clerk_user_id)
    fake_verifier.register(
        "operator-token", VerifiedExternalIdentity(clerk_user_id, "op@example.com", True)
    )
    return {"Authorization": "Bearer operator-token"}


async def test_operator_list_endpoint_requires_authorization(client):
    response = await client.get("/api/repair-submissions")
    assert response.status_code == 401


async def test_operator_list_endpoint_rejects_non_operator(client, fake_verifier, db_session):
    user = User(clerk_user_id="clerk_landlord_only", status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    fake_verifier.register(
        "landlord-token", VerifiedExternalIdentity("clerk_landlord_only", "l@example.com", True)
    )

    response = await client.get(
        "/api/repair-submissions", headers={"Authorization": "Bearer landlord-token"}
    )
    assert response.status_code == 403


async def test_operator_can_list_and_get_a_submission(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_operator_1")
    await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)

    listing = await client.get("/api/repair-submissions", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) >= 1
    submission_id = listing.json()[0]["id"]

    detail = await client.get(f"/api/repair-submissions/{submission_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["landlord_email"] == "jamie@example.com"


async def test_operator_can_update_status_and_internal_notes(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_operator_2")
    await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    listing = (await client.get("/api/repair-submissions", headers=headers)).json()
    submission_id = listing[0]["id"]

    response = await client.patch(
        f"/api/repair-submissions/{submission_id}",
        json={"status": "reviewing", "internal_review_notes": "Looks straightforward."},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "reviewing"
    assert body["internal_review_notes"] == "Looks straightforward."


async def test_closing_a_submission_requires_a_reason(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_operator_3")
    await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    listing = (await client.get("/api/repair-submissions", headers=headers)).json()
    submission_id = listing[0]["id"]

    response = await client.patch(
        f"/api/repair-submissions/{submission_id}",
        json={"status": "closed"},
        headers=headers,
    )
    assert response.status_code == 422


async def test_closing_a_submission_with_a_reason_succeeds(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_operator_4")
    await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    listing = (await client.get("/api/repair-submissions", headers=headers)).json()
    submission_id = listing[0]["id"]

    response = await client.patch(
        f"/api/repair-submissions/{submission_id}",
        json={"status": "closed", "closed_reason": "not_currently_viable"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["closed_reason"] == "not_currently_viable"


async def test_public_request_cannot_set_a_status_back_to_new(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_operator_5")
    await client.post("/api/repair-submissions", json=_VALID_PAYLOAD)
    listing = (await client.get("/api/repair-submissions", headers=headers)).json()
    submission_id = listing[0]["id"]

    response = await client.patch(
        f"/api/repair-submissions/{submission_id}",
        json={"status": "new"},
        headers=headers,
    )
    assert response.status_code == 422
