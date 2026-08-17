import uuid
from datetime import UTC, datetime

from app.auth.identity import VerifiedExternalIdentity
from app.models.enums import (
    Capability,
    CapabilitySource,
    CapabilityStatus,
    PreferredContactMethod,
    SubmissionStatus,
    UserStatus,
)
from app.models.repair_submission import RepairSubmission
from app.models.user import User, UserCapability

_VALID_GENERATED_BRIEF = {
    "category": "leak",
    "observedFacts": {"affected": "ceiling", "branchFirst": "rain", "duration": "today"},
    "priorAction": {"status": "attempted"},
    "hasEvidence": "yes",
    "evidenceKind": "repair-media",
    "propertyDetails": {"district": "wan-chai"},
}


async def _make_submission(db_session) -> RepairSubmission:
    submission = RepairSubmission(
        public_reference=f"RS-{uuid.uuid4().hex[:6].upper()}",
        status=SubmissionStatus.new,
        questionnaire_version="v1",
        issue_category="leak",
        questionnaire_answers={},
        generated_brief=_VALID_GENERATED_BRIEF,
        safety_flags=[],
        landlord_name="Jamie Landlord",
        landlord_email="jamie@example.com",
        landlord_phone="91234567",
        property_address="Some estate, Wan Chai",
        preferred_contact_method=PreferredContactMethod.email,
        consent_to_contact=True,
        consent_to_share_with_contractors=False,
    )
    db_session.add(submission)
    await db_session.commit()
    await db_session.refresh(submission)
    return submission


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
        clerk_user_id, VerifiedExternalIdentity(clerk_user_id, "op@example.com", True)
    )
    return {"Authorization": f"Bearer {clerk_user_id}"}


def _create_url(submission_id) -> str:
    return f"/api/repair-submissions/{submission_id}/contractor-requests"


_VALID_CREATE_PAYLOAD = {
    "contractor_label": "ABC Plumbing",
    "client_contractor_id": "contractor-123",
}


# --- Auth / capability ------------------------------------------------


async def test_create_is_rejected_when_unauthenticated(client, db_session):
    submission = await _make_submission(db_session)
    response = await client.post(_create_url(submission.id), json=_VALID_CREATE_PAYLOAD)
    assert response.status_code == 401


async def test_create_is_rejected_for_a_non_operator(client, fake_verifier, db_session):
    user = User(clerk_user_id="clerk_landlord_only", status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    fake_verifier.register(
        "landlord-token", VerifiedExternalIdentity("clerk_landlord_only", "l@example.com", True)
    )
    submission = await _make_submission(db_session)

    response = await client.post(
        _create_url(submission.id),
        json=_VALID_CREATE_PAYLOAD,
        headers={"Authorization": "Bearer landlord-token"},
    )
    assert response.status_code == 403


async def test_list_and_read_and_revoke_all_require_operator_capability(
    client, fake_verifier, db_session
):
    user = User(clerk_user_id="clerk_landlord_2", status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()
    fake_verifier.register(
        "landlord-token-2", VerifiedExternalIdentity("clerk_landlord_2", "l2@example.com", True)
    )
    headers = {"Authorization": "Bearer landlord-token-2"}
    submission = await _make_submission(db_session)
    fake_id = uuid.uuid4()

    assert (await client.get(_create_url(submission.id), headers=headers)).status_code == 403
    assert (
        await client.get(f"{_create_url(submission.id)}/{fake_id}", headers=headers)
    ).status_code == 403
    assert (
        await client.post(f"{_create_url(submission.id)}/{fake_id}/revoke", headers=headers)
    ).status_code == 403


# --- Missing case -----------------------------------------------------


async def test_create_against_a_missing_submission_returns_404(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_missing_1")
    response = await client.post(
        _create_url(uuid.uuid4()), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    assert response.status_code == 404


async def test_list_against_a_missing_submission_returns_404(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_missing_2")
    response = await client.get(_create_url(uuid.uuid4()), headers=headers)
    assert response.status_code == 404


# --- Create -------------------------------------------------------------


async def test_operator_can_create_a_contractor_request(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_1")
    submission = await _make_submission(db_session)

    response = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "open"
    assert body["contractor_label"] == "ABC Plumbing"
    assert body["client_contractor_id"] == "contractor-123"
    assert len(body["access_token"]) >= 32


async def test_stage1_snapshot_is_generated_server_side_not_accepted_from_the_caller(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_2")
    submission = await _make_submission(db_session)

    # A caller cannot pass a stage1 snapshot at all — extra="forbid".
    payload = {**_VALID_CREATE_PAYLOAD, "stage1_snapshot": {"category": "INJECTED"}}
    response = await client.post(_create_url(submission.id), json=payload, headers=headers)
    assert response.status_code == 422


async def test_created_request_has_a_real_server_built_snapshot(client, fake_verifier, db_session):
    from app.repositories.contractor_requests import get_contractor_request_by_id

    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_3")
    submission = await _make_submission(db_session)

    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]

    stored = await get_contractor_request_by_id(db_session, uuid.UUID(request_id))
    assert stored.stage1_snapshot["category"] == "leak"
    assert stored.stage1_snapshot["district"] == "wan-chai"


async def test_raw_token_is_returned_once_and_never_appears_in_list_or_read(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_4")
    submission = await _make_submission(db_session)

    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    raw_token = created.json()["access_token"]
    request_id = created.json()["id"]

    listing = await client.get(_create_url(submission.id), headers=headers)
    assert raw_token not in listing.text
    assert "access_token" not in listing.text
    assert "token_hash" not in listing.text

    detail = await client.get(f"{_create_url(submission.id)}/{request_id}", headers=headers)
    assert raw_token not in detail.text
    assert "access_token" not in detail.text
    assert "token_hash" not in detail.text


async def test_contractor_label_is_required(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_5")
    submission = await _make_submission(db_session)

    response = await client.post(
        _create_url(submission.id), json={"client_contractor_id": "x"}, headers=headers
    )
    assert response.status_code == 422


async def test_client_contractor_id_is_optional(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_create_6")
    submission = await _make_submission(db_session)

    response = await client.post(
        _create_url(submission.id), json={"contractor_label": "XYZ Electrics"}, headers=headers
    )
    assert response.status_code == 201
    assert response.json()["client_contractor_id"] is None


# --- List / isolation ----------------------------------------------------


async def test_list_is_scoped_to_its_own_submission(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_list_1")
    submission_a = await _make_submission(db_session)
    submission_b = await _make_submission(db_session)

    await client.post(
        _create_url(submission_a.id),
        json={"contractor_label": "Contractor A"},
        headers=headers,
    )
    await client.post(
        _create_url(submission_b.id),
        json={"contractor_label": "Contractor B"},
        headers=headers,
    )

    listing_a = await client.get(_create_url(submission_a.id), headers=headers)
    labels_a = {r["contractor_label"] for r in listing_a.json()}
    assert labels_a == {"Contractor A"}

    listing_b = await client.get(_create_url(submission_b.id), headers=headers)
    labels_b = {r["contractor_label"] for r in listing_b.json()}
    assert labels_b == {"Contractor B"}


async def test_a_request_from_case_a_cannot_be_read_through_case_bs_route(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_isolation_1")
    submission_a = await _make_submission(db_session)
    submission_b = await _make_submission(db_session)

    created = await client.post(
        _create_url(submission_a.id),
        json={"contractor_label": "Contractor A"},
        headers=headers,
    )
    request_id = created.json()["id"]

    cross_case_read = await client.get(
        f"{_create_url(submission_b.id)}/{request_id}", headers=headers
    )
    assert cross_case_read.status_code == 404


async def test_a_request_from_case_a_cannot_be_revoked_through_case_bs_route(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_isolation_2")
    submission_a = await _make_submission(db_session)
    submission_b = await _make_submission(db_session)

    created = await client.post(
        _create_url(submission_a.id),
        json={"contractor_label": "Contractor A"},
        headers=headers,
    )
    request_id = created.json()["id"]

    cross_case_revoke = await client.post(
        f"{_create_url(submission_b.id)}/{request_id}/revoke", headers=headers
    )
    assert cross_case_revoke.status_code == 404

    # Confirm it is genuinely unaffected via its real case's own route.
    real = await client.get(f"{_create_url(submission_a.id)}/{request_id}", headers=headers)
    assert real.json()["status"] == "open"


# --- Revoke ---------------------------------------------------------------


async def test_revoking_an_open_request_succeeds(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_revoke_1")
    submission = await _make_submission(db_session)
    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]

    response = await client.post(
        f"{_create_url(submission.id)}/{request_id}/revoke", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["status"] == "revoked"


async def test_revoking_an_already_revoked_request_is_idempotent(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_revoke_2")
    submission = await _make_submission(db_session)
    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]

    first = await client.post(f"{_create_url(submission.id)}/{request_id}/revoke", headers=headers)
    assert first.status_code == 200
    second = await client.post(f"{_create_url(submission.id)}/{request_id}/revoke", headers=headers)
    assert second.status_code == 200
    assert second.json()["status"] == "revoked"


async def test_revoking_a_responded_request_is_rejected(client, fake_verifier, db_session):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_revoke_3")
    submission = await _make_submission(db_session)
    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]
    raw_token = created.json()["access_token"]

    await client.post(
        f"/api/contractor-requests/{raw_token}/response",
        json={"responseType": "interested"},
    )

    revoke = await client.post(f"{_create_url(submission.id)}/{request_id}/revoke", headers=headers)
    assert revoke.status_code == 409

    detail = await client.get(f"{_create_url(submission.id)}/{request_id}", headers=headers)
    assert detail.json()["status"] == "responded"
    assert detail.json()["revoked_at"] is None


# --- Responded request detail ----------------------------------------------


async def test_operator_detail_shows_the_validated_response_once_present(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_detail_1")
    submission = await _make_submission(db_session)
    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]
    raw_token = created.json()["access_token"]

    await client.post(
        f"/api/contractor-requests/{raw_token}/response",
        json={
            "responseType": "proposal-provided",
            "priceType": "fixed",
            "price": 4200,
            "proposedApproach": "Replace the seal.",
        },
    )

    detail = await client.get(f"{_create_url(submission.id)}/{request_id}", headers=headers)
    body = detail.json()
    assert body["status"] == "responded"
    assert body["response_type"] == "proposal-provided"
    assert body["response_payload"]["price"] == 4200
    assert body["response_schema_version"] == 1


async def test_operator_detail_before_any_response_has_no_response_data(
    client, fake_verifier, db_session
):
    headers = await _authed_headers(fake_verifier, db_session, "clerk_op_detail_2")
    submission = await _make_submission(db_session)
    created = await client.post(
        _create_url(submission.id), json=_VALID_CREATE_PAYLOAD, headers=headers
    )
    request_id = created.json()["id"]

    detail = await client.get(f"{_create_url(submission.id)}/{request_id}", headers=headers)
    body = detail.json()
    assert body["status"] == "open"
    assert body["response_type"] is None
    assert body["response_payload"] is None
