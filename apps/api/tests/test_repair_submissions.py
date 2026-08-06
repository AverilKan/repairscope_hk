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
