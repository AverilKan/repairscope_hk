import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.contractor_request import ContractorRequest
from app.models.enums import ContractorResponseType, PreferredContactMethod, SubmissionStatus
from app.models.repair_submission import RepairSubmission
from app.repositories.contractor_requests import (
    create_contractor_request,
    get_contractor_request_by_id,
    get_contractor_request_by_token_hash,
    list_contractor_requests_for_submission,
)
from app.services.contractor_request_lifecycle import (
    DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS,
    ContractorRequestStatus,
    derive_status,
)
from app.services.contractor_tokens import generate_access_token, hash_access_token

# --- Token utility tests ---------------------------------------------------


def test_generate_access_token_has_adequate_length_and_url_safe_shape():
    token = generate_access_token()
    # secrets.token_urlsafe(32) yields a base64url string of roughly 43
    # characters for 32 raw bytes (256 bits) — a generous lower bound here
    # avoids pinning to the exact encoding length while still catching a
    # regression to something drastically shorter/weaker.
    assert len(token) >= 32
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    assert set(token) <= allowed


def test_different_tokens_are_different():
    tokens = {generate_access_token() for _ in range(20)}
    assert len(tokens) == 20


def test_hash_access_token_is_consistent_for_the_same_input():
    token = generate_access_token()
    assert hash_access_token(token) == hash_access_token(token)


def test_hash_access_token_differs_for_different_inputs():
    a, b = generate_access_token(), generate_access_token()
    assert hash_access_token(a) != hash_access_token(b)


def test_hash_access_token_is_a_64_character_hex_digest():
    digest = hash_access_token(generate_access_token())
    assert len(digest) == 64
    assert set(digest) <= set("0123456789abcdef")


# --- Model / persistence tests ---------------------------------------------

_VALID_STAGE1_SNAPSHOT = {"schema_version": 1, "category": "leak", "symptomOtherPresent": False}


async def _make_submission(db_session) -> RepairSubmission:
    submission = RepairSubmission(
        public_reference=f"RS-{uuid.uuid4().hex[:6].upper()}",
        status=SubmissionStatus.new,
        questionnaire_version="v1",
        issue_category="leak",
        questionnaire_answers={},
        generated_brief={},
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


def _new_request(
    submission: RepairSubmission,
    *,
    token: str | None = None,
    contractor_label: str = "ABC Plumbing",
    client_contractor_id: str | None = "contractor-123",
    expires_at: datetime | None = None,
    responded_at: datetime | None = None,
    revoked_at: datetime | None = None,
    response_type: ContractorResponseType | None = None,
    response_payload: dict | None = None,
    response_schema_version: int | None = None,
) -> ContractorRequest:
    raw = token or generate_access_token()
    return ContractorRequest(
        repair_submission_id=submission.id,
        client_contractor_id=client_contractor_id,
        contractor_label=contractor_label,
        token_hash=hash_access_token(raw),
        stage1_snapshot=_VALID_STAGE1_SNAPSHOT,
        expires_at=expires_at
        or (datetime.now(UTC) + timedelta(days=DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS)),
        responded_at=responded_at,
        revoked_at=revoked_at,
        response_type=response_type,
        response_payload=response_payload,
        response_schema_version=response_schema_version,
    )


async def test_contractor_request_can_be_created_and_retrieved(db_session):
    submission = await _make_submission(db_session)
    raw_token = generate_access_token()
    request = _new_request(submission, token=raw_token)

    created = await create_contractor_request(db_session, request)
    assert created.id is not None

    fetched = await get_contractor_request_by_id(db_session, created.id)
    assert fetched is not None
    assert fetched.repair_submission_id == submission.id
    assert fetched.contractor_label == "ABC Plumbing"
    assert fetched.client_contractor_id == "contractor-123"
    assert fetched.stage1_snapshot == _VALID_STAGE1_SNAPSHOT
    assert fetched.stage1_schema_version == 1


async def test_contractor_request_is_looked_up_by_token_hash_not_a_raw_value(db_session):
    submission = await _make_submission(db_session)
    raw_token = generate_access_token()
    request = _new_request(submission, token=raw_token)
    await create_contractor_request(db_session, request)

    found = await get_contractor_request_by_token_hash(db_session, hash_access_token(raw_token))
    assert found is not None

    not_found_by_raw = await get_contractor_request_by_token_hash(db_session, raw_token)
    assert not_found_by_raw is None


async def test_raw_token_value_is_never_persisted_on_the_model(db_session):
    submission = await _make_submission(db_session)
    raw_token = generate_access_token()
    request = _new_request(submission, token=raw_token)
    created = await create_contractor_request(db_session, request)

    # Scan every column value on the persisted row — the raw token must
    # not appear anywhere, only its hash.
    values = [
        str(created.id),
        str(created.repair_submission_id),
        created.client_contractor_id,
        created.contractor_label,
        created.token_hash,
        str(created.stage1_snapshot),
        str(created.response_payload),
    ]
    assert raw_token not in values
    assert created.token_hash == hash_access_token(raw_token)
    assert created.token_hash != raw_token


async def test_contractor_request_requires_a_real_repair_submission(db_session):
    bogus = ContractorRequest(
        repair_submission_id=uuid.uuid4(),
        contractor_label="Nonexistent Case Co.",
        token_hash=hash_access_token(generate_access_token()),
        stage1_snapshot=_VALID_STAGE1_SNAPSHOT,
        expires_at=datetime.now(UTC) + timedelta(days=DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS),
    )
    db_session.add(bogus)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_token_hash_must_be_unique(db_session):
    submission = await _make_submission(db_session)
    raw_token = generate_access_token()
    shared_hash = hash_access_token(raw_token)

    first = ContractorRequest(
        repair_submission_id=submission.id,
        contractor_label="Contractor A",
        token_hash=shared_hash,
        stage1_snapshot=_VALID_STAGE1_SNAPSHOT,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    await create_contractor_request(db_session, first)

    second = ContractorRequest(
        repair_submission_id=submission.id,
        contractor_label="Contractor B",
        token_hash=shared_hash,
        stage1_snapshot=_VALID_STAGE1_SNAPSHOT,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    db_session.add(second)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_list_contractor_requests_for_submission_is_scoped_and_ordered(db_session):
    submission_a = await _make_submission(db_session)
    submission_b = await _make_submission(db_session)

    await create_contractor_request(db_session, _new_request(submission_a, contractor_label="A1"))
    await create_contractor_request(db_session, _new_request(submission_a, contractor_label="A2"))
    await create_contractor_request(db_session, _new_request(submission_b, contractor_label="B1"))

    for_a = await list_contractor_requests_for_submission(db_session, submission_a.id)
    assert {r.contractor_label for r in for_a} == {"A1", "A2"}

    for_b = await list_contractor_requests_for_submission(db_session, submission_b.id)
    assert {r.contractor_label for r in for_b} == {"B1"}


# --- Lifecycle derivation tests ---------------------------------------------


def test_lifecycle_open_when_nothing_set_and_not_expired():
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=None, revoked_at=None, expires_at=now + timedelta(days=1), now=now
    )
    assert status == ContractorRequestStatus.open


def test_lifecycle_responded_when_responded_at_set():
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=now, revoked_at=None, expires_at=now + timedelta(days=1), now=now
    )
    assert status == ContractorRequestStatus.responded


def test_lifecycle_revoked_when_revoked_and_not_responded():
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=None, revoked_at=now, expires_at=now + timedelta(days=1), now=now
    )
    assert status == ContractorRequestStatus.revoked


def test_lifecycle_expired_when_past_expiry_and_otherwise_open_shaped():
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=None, revoked_at=None, expires_at=now - timedelta(seconds=1), now=now
    )
    assert status == ContractorRequestStatus.expired


def test_lifecycle_expiry_boundary_is_inclusive_of_expires_at():
    # expires_at == now is treated as already expired (">" not used), so a
    # request cannot be considered open at the exact instant its window
    # closes.
    now = datetime.now(UTC)
    status = derive_status(responded_at=None, revoked_at=None, expires_at=now, now=now)
    assert status == ContractorRequestStatus.expired


def test_lifecycle_responded_takes_precedence_over_revoked_and_expiry():
    # Defensive fallback for an otherwise-prevented impossible combination
    # (see derive_status's own docstring) — a committed response is never
    # hidden behind a later/concurrent revoke or an expired clock.
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=now, revoked_at=now, expires_at=now - timedelta(days=1), now=now
    )
    assert status == ContractorRequestStatus.responded


def test_lifecycle_revoked_takes_precedence_over_expiry():
    now = datetime.now(UTC)
    status = derive_status(
        responded_at=None, revoked_at=now, expires_at=now - timedelta(days=1), now=now
    )
    assert status == ContractorRequestStatus.revoked
