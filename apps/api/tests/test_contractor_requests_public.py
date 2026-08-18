import uuid
from datetime import UTC, datetime, timedelta

from app.models.contractor_request import ContractorRequest
from app.models.enums import PreferredContactMethod, SubmissionStatus
from app.models.repair_submission import RepairSubmission
from app.repositories.contractor_requests import create_contractor_request
from app.services.contractor_tokens import generate_access_token, hash_access_token
from app.services.stage1_snapshot import build_stage1_snapshot

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


async def _make_request(
    db_session,
    submission: RepairSubmission,
    *,
    responded_at: datetime | None = None,
    revoked_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> tuple[str, ContractorRequest]:
    raw_token = generate_access_token()
    snapshot = build_stage1_snapshot(submission)
    contractor_request = ContractorRequest(
        repair_submission_id=submission.id,
        contractor_label="ABC Plumbing",
        client_contractor_id="contractor-123",
        token_hash=hash_access_token(raw_token),
        stage1_snapshot=snapshot.model_dump(mode="json"),
        expires_at=expires_at or (datetime.now(UTC) + timedelta(days=7)),
        responded_at=responded_at,
        revoked_at=revoked_at,
    )
    created = await create_contractor_request(db_session, contractor_request)
    return raw_token, created


_VALID_INTERESTED = {"responseType": "interested", "originalResponse": "Happy to take a look."}
_VALID_PROPOSAL_FIXED = {
    "responseType": "proposal-provided",
    "priceType": "fixed",
    "price": 3500,
    "proposedApproach": "Replace the seal.",
}


# --- GET semantics -----------------------------------------------------


async def test_get_open_request_returns_the_stage1_snapshot(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.get(f"/api/contractor-requests/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "open"
    assert body["stage1"]["category"] == "leak"
    assert body["stage1"]["district"] == "wan-chai"


async def test_get_unknown_token_returns_404(client):
    response = await client.get("/api/contractor-requests/not-a-real-token-at-all")
    assert response.status_code == 404


async def test_get_revoked_request_reports_revoked_with_no_snapshot(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission, revoked_at=datetime.now(UTC))

    response = await client.get(f"/api/contractor-requests/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "revoked"
    assert body["stage1"] is None


async def test_get_expired_request_reports_expired_with_no_snapshot(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(
        db_session, submission, expires_at=datetime.now(UTC) - timedelta(seconds=1)
    )

    response = await client.get(f"/api/contractor-requests/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "expired"
    assert body["stage1"] is None


async def test_get_responded_request_reports_responded_without_echoing_the_previous_response(
    client, db_session
):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    submit = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED
    )
    assert submit.status_code == 201

    response = await client.get(f"/api/contractor-requests/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "responded"
    assert body["stage1"] is None
    assert set(body.keys()) == {"status", "stage1"}
    assert "originalResponse" not in response.text


async def test_public_response_never_exposes_owner_or_request_metadata(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.get(f"/api/contractor-requests/{token}")
    body = response.json()
    forbidden_substrings = [
        str(submission.id),
        submission.public_reference,
        "jamie@example.com",
        "Jamie Landlord",
        "91234567",
        "ABC Plumbing",
        "contractor-123",
    ]
    for forbidden in forbidden_substrings:
        assert forbidden not in response.text, f"leaked: {forbidden}"
    assert set(body.keys()) == {"status", "stage1"}
    assert set(body["stage1"].keys()) <= {
        "schema_version",
        "category",
        "district",
        "affected",
        "branchFirst",
        "branchSecond",
        "branchThird",
        "duration",
        "frequency",
        "worsening",
        "priorStatus",
        "hasEvidence",
        "evidenceKind",
        "symptomOtherPresent",
    }


async def test_token_a_cannot_read_request_b(client, db_session):
    submission = await _make_submission(db_session)
    token_a, request_a = await _make_request(db_session, submission)
    token_b, request_b = await _make_request(db_session, submission)
    assert request_a.id != request_b.id

    response = await client.get(f"/api/contractor-requests/{token_a}")
    assert response.status_code == 200
    # Sanity: both requests are independently reachable by their own token.
    response_b = await client.get(f"/api/contractor-requests/{token_b}")
    assert response_b.status_code == 200


# --- POST: happy path ----------------------------------------------------


async def test_valid_interested_response_is_accepted(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED
    )
    assert response.status_code == 201
    assert response.json()["status"] == "responded"


async def test_valid_proposal_response_is_accepted(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_PROPOSAL_FIXED
    )
    assert response.status_code == 201


async def test_response_is_persisted_with_type_and_payload(client, db_session):
    submission = await _make_submission(db_session)
    token, contractor_request = await _make_request(db_session, submission)

    await client.post(f"/api/contractor-requests/{token}/response", json=_VALID_PROPOSAL_FIXED)

    await db_session.refresh(contractor_request)
    assert contractor_request.response_type.value == "proposal-provided"
    assert contractor_request.response_payload["price"] == 3500
    assert contractor_request.response_schema_version == 1
    assert contractor_request.responded_at is not None


# --- POST: unknown token / duplicate / revoked / expired -----------------


async def test_post_unknown_token_returns_404(client):
    response = await client.post(
        "/api/contractor-requests/not-a-real-token-at-all/response", json=_VALID_INTERESTED
    )
    assert response.status_code == 404


async def test_double_submission_is_rejected_and_never_overwrites_the_first_response(
    client, db_session
):
    submission = await _make_submission(db_session)
    token, contractor_request = await _make_request(db_session, submission)

    first = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED
    )
    assert first.status_code == 201

    second = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_PROPOSAL_FIXED
    )
    assert second.status_code == 409

    await db_session.refresh(contractor_request)
    assert contractor_request.response_type.value == "interested"
    assert contractor_request.response_payload.get("price") is None


async def test_submission_against_a_revoked_request_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, contractor_request = await _make_request(
        db_session, submission, revoked_at=datetime.now(UTC)
    )

    response = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED
    )
    assert response.status_code == 409

    await db_session.refresh(contractor_request)
    assert contractor_request.responded_at is None


async def test_submission_against_an_expired_request_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, contractor_request = await _make_request(
        db_session, submission, expires_at=datetime.now(UTC) - timedelta(seconds=1)
    )

    response = await client.post(
        f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED
    )
    assert response.status_code == 409

    await db_session.refresh(contractor_request)
    assert contractor_request.responded_at is None


async def test_simulated_racing_submissions_only_one_ever_wins(db_session):
    # Two "concurrent-ish" submission attempts against the same request —
    # exercised directly against the atomic repository function (the same
    # one the route uses) since the test client is sequential. Only the
    # first conditional UPDATE may ever succeed.
    from app.models.enums import ContractorResponseType
    from app.repositories.contractor_requests import try_submit_contractor_response

    submission = await _make_submission(db_session)
    _, contractor_request = await _make_request(db_session, submission)
    now = datetime.now(UTC)

    first = await try_submit_contractor_response(
        db_session,
        contractor_request.id,
        response_type=ContractorResponseType.interested,
        response_payload={"responseType": "interested"},
        response_schema_version=1,
        now=now,
    )
    second = await try_submit_contractor_response(
        db_session,
        contractor_request.id,
        response_type=ContractorResponseType.proposal_provided,
        response_payload={"responseType": "proposal-provided", "priceType": "fixed", "price": 1},
        response_schema_version=1,
        now=now,
    )
    assert first is True
    assert second is False

    await db_session.refresh(contractor_request)
    assert contractor_request.response_type == ContractorResponseType.interested


# --- POST: strict validation ----------------------------------------------


async def test_negative_price_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {**_VALID_PROPOSAL_FIXED, "price": -100}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_non_finite_price_is_rejected(client, db_session):
    # Standard JSON cannot represent Infinity — even httpx's own client-side
    # encoder refuses to serialize a plain Python float("inf") via `json=`.
    # Send the (non-standard-but-parseable) literal directly as raw body
    # bytes so this proves the *server's* allow_inf_nan=False rejection,
    # not merely that a well-formed JSON client can't construct the value.
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    body = (
        b'{"responseType": "proposal-provided", "priceType": "fixed", '
        b'"price": Infinity, "proposedApproach": "Replace the seal."}'
    )
    response = await client.post(
        f"/api/contractor-requests/{token}/response",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


async def test_inverted_price_range_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {
        "responseType": "proposal-provided",
        "priceType": "range",
        "priceMin": 9000,
        "priceMax": 3000,
    }
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_invalid_price_type_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {"responseType": "proposal-provided", "priceType": "not-a-real-price-type"}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_invalid_response_type_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {"responseType": "not-a-real-response-type"}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_no_price_yet_must_not_carry_a_numeric_price(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {"responseType": "proposal-provided", "priceType": "no-price", "price": 100}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_needs_inspection_with_a_proposal_price_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {
        "responseType": "needs-inspection",
        "inspectionRequirement": "required",
        "priceType": "fixed",
        "price": 500,
    }
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_not_suitable_with_a_guarantee_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {"responseType": "not-suitable", "guaranteeStatus": "yes"}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_guarantee_details_without_yes_status_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {
        **_VALID_PROPOSAL_FIXED,
        "guaranteeStatus": "no",
        "guaranteeDetails": "12 months parts and labour.",
    }
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_missing_required_inspection_requirement_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {"responseType": "needs-inspection"}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_unexpected_field_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {**_VALID_INTERESTED, "somethingUnexpected": "value"}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code == 422


async def test_operator_only_fields_are_rejected_not_silently_dropped(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    for field, value in [
        ("id", "injected-id"),
        ("name", "Injected Name"),
        ("trade", "Injected Trade"),
        ("contactReference", "WhatsApp 9999 9999"),
        ("status", "contacted"),
        ("notes", "Injected operator notes"),
    ]:
        payload = {**_VALID_INTERESTED, field: value}
        response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
        assert response.status_code == 422, f"expected rejection for field '{field}'"


async def test_oversized_body_is_rejected(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    payload = {**_VALID_INTERESTED, "originalResponse": "x" * 25_000}
    response = await client.post(f"/api/contractor-requests/{token}/response", json=payload)
    assert response.status_code in (413, 422)


# --- Content-Length handling (never a bare int() crash) --------------------


async def test_non_numeric_content_length_is_rejected_cleanly_not_a_500(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.post(
        f"/api/contractor-requests/{token}/response",
        content=b"{}",
        headers={"Content-Length": "abc", "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.status_code != 500


async def test_negative_content_length_is_rejected_cleanly_not_a_500(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.post(
        f"/api/contractor-requests/{token}/response",
        content=b"{}",
        headers={"Content-Length": "-5", "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.status_code != 500


async def test_over_limit_numeric_content_length_is_rejected_as_too_large(client, db_session):
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    # The header alone claims an oversized body — must be rejected before
    # (or regardless of) reading the (here, tiny) actual body.
    response = await client.post(
        f"/api/contractor-requests/{token}/response",
        content=b"{}",
        headers={"Content-Length": "999999", "Content-Type": "application/json"},
    )
    assert response.status_code == 413


async def test_fake_low_content_length_with_actually_oversized_body_is_still_rejected(
    client, db_session
):
    # Content-Length is never trusted as the sole defense — even if a
    # caller lies with a small header value, the real received body size
    # is what's authoritative.
    submission = await _make_submission(db_session)
    token, _ = await _make_request(db_session, submission)

    response = await client.post(
        f"/api/contractor-requests/{token}/response",
        content=b"x" * 30_000,
        headers={"Content-Length": "5", "Content-Type": "application/json"},
    )
    assert response.status_code == 413


# --- No raw token ever persisted -------------------------------------------


async def test_raw_token_never_appears_in_the_persisted_row(client, db_session):
    submission = await _make_submission(db_session)
    token, contractor_request = await _make_request(db_session, submission)

    await client.get(f"/api/contractor-requests/{token}")
    await client.post(f"/api/contractor-requests/{token}/response", json=_VALID_INTERESTED)

    await db_session.refresh(contractor_request)
    assert contractor_request.token_hash != token
    assert token not in str(contractor_request.token_hash)
    assert token not in str(contractor_request.response_payload)
