"""Genuine revoke/submit concurrency coverage — the T1 Codex-audit fix.

The original revoke implementation read a ContractorRequest into Python,
inspected its (possibly already-stale) in-memory responded_at, then wrote
revoked_at unconditionally. Codex reproduced a schedule against real
PostgreSQL where a concurrent contractor submission committed responded_at
in between revoke's read and revoke's write, leaving a row with BOTH
responded_at and revoked_at set — violating the lifecycle invariant.

These tests exercise the fixed atomic implementation
(try_revoke_contractor_request / try_submit_contractor_response, both plain
conditional UPDATE ... WHERE ... RETURNING-shaped statements) using
independent AsyncSession/connection pairs against the real local
PostgreSQL — never by asserting on derive_status() alone; every test reads
the actual persisted columns back from the database.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from app.core.db import _session_factory
from app.core.errors import ConflictError
from app.models.contractor_request import ContractorRequest
from app.models.enums import ContractorResponseType, PreferredContactMethod, SubmissionStatus
from app.models.repair_submission import RepairSubmission
from app.repositories.contractor_requests import (
    create_contractor_request,
    get_contractor_request_by_id,
    try_revoke_contractor_request,
    try_submit_contractor_response,
)
from app.services.contractor_requests import revoke_contractor_request
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


async def _make_submission(session) -> RepairSubmission:
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
    session.add(submission)
    await session.commit()
    await session.refresh(submission)
    return submission


async def _make_request(session, submission: RepairSubmission) -> ContractorRequest:
    raw_token = generate_access_token()
    snapshot = build_stage1_snapshot(submission)
    contractor_request = ContractorRequest(
        repair_submission_id=submission.id,
        contractor_label="ABC Plumbing",
        token_hash=hash_access_token(raw_token),
        stage1_snapshot=snapshot.model_dump(mode="json"),
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    return await create_contractor_request(session, contractor_request)


def _submit_kwargs(now: datetime) -> dict:
    return {
        "response_type": ContractorResponseType.interested,
        "response_payload": {"responseType": "interested"},
        "response_schema_version": 1,
        "now": now,
    }


# --- Deterministic-order schedules (proves the WHERE-clause mechanics) -----


async def test_schedule_a_submit_commits_first_then_revoke_cannot_persist(db_session):
    submission = await _make_submission(db_session)
    contractor_request = await _make_request(db_session, submission)
    now = datetime.now(UTC)

    submit_session = _session_factory()
    revoke_session = _session_factory()
    try:
        submitted = await try_submit_contractor_response(
            submit_session, contractor_request.id, **_submit_kwargs(now)
        )
        assert submitted is True

        revoked = await try_revoke_contractor_request(
            revoke_session, contractor_request.id, submission.id, now=datetime.now(UTC)
        )
        assert revoked is False
    finally:
        await submit_session.close()
        await revoke_session.close()

    persisted = await get_contractor_request_by_id(db_session, contractor_request.id)
    await db_session.refresh(persisted)
    assert persisted.responded_at is not None
    assert persisted.revoked_at is None
    assert not (persisted.responded_at is not None and persisted.revoked_at is not None)


async def test_schedule_b_revoke_commits_first_then_submit_cannot_persist(db_session):
    submission = await _make_submission(db_session)
    contractor_request = await _make_request(db_session, submission)
    now = datetime.now(UTC)

    revoke_session = _session_factory()
    submit_session = _session_factory()
    try:
        revoked = await try_revoke_contractor_request(
            revoke_session, contractor_request.id, submission.id, now=now
        )
        assert revoked is True

        submitted = await try_submit_contractor_response(
            submit_session, contractor_request.id, **_submit_kwargs(datetime.now(UTC))
        )
        assert submitted is False
    finally:
        await revoke_session.close()
        await submit_session.close()

    persisted = await get_contractor_request_by_id(db_session, contractor_request.id)
    await db_session.refresh(persisted)
    assert persisted.revoked_at is not None
    assert persisted.responded_at is None
    assert not (persisted.responded_at is not None and persisted.revoked_at is not None)


# --- Genuine concurrent interleaving (real, independent DB connections) ---


async def _run_submit(request_id: uuid.UUID, now: datetime) -> bool:
    session = _session_factory()
    try:
        return await try_submit_contractor_response(session, request_id, **_submit_kwargs(now))
    finally:
        await session.close()


async def _run_revoke(request_id: uuid.UUID, submission_id: uuid.UUID, now: datetime) -> bool:
    session = _session_factory()
    try:
        return await try_revoke_contractor_request(session, request_id, submission_id, now=now)
    finally:
        await session.close()


async def test_genuine_concurrent_submit_and_revoke_never_both_persist(db_session):
    """Two independent AsyncSessions (independent asyncpg connections)
    issue their conditional UPDATEs via asyncio.gather — genuinely
    concurrent from the application's point of view. PostgreSQL's row-level
    locking under READ COMMITTED serializes the two UPDATEs against the
    same row: whichever commits first "wins", and the second's WHERE
    clause is re-evaluated against the now-committed row, so it necessarily
    fails to match. Repeated across many independent rows so the real,
    timing-dependent race is actually exercised many times, not just
    hoped for once."""
    for _ in range(20):
        submission = await _make_submission(db_session)
        contractor_request = await _make_request(db_session, submission)
        now = datetime.now(UTC)

        submitted, revoked = await asyncio.gather(
            _run_submit(contractor_request.id, now),
            _run_revoke(contractor_request.id, submission.id, now),
        )

        # Exactly one of the two concurrent attempts may have won.
        assert submitted != revoked, (
            f"expected exactly one writer to win, got submitted={submitted} revoked={revoked}"
        )

        persisted = await get_contractor_request_by_id(db_session, contractor_request.id)
        await db_session.refresh(persisted)
        # The actual persisted columns — never derive_status() — are the
        # proof. This is the exact invariant Codex's finding violated.
        assert not (persisted.responded_at is not None and persisted.revoked_at is not None), (
            "row has BOTH responded_at and revoked_at set — lifecycle invariant violated"
        )
        if submitted:
            assert persisted.responded_at is not None
            assert persisted.revoked_at is None
        else:
            assert persisted.revoked_at is not None
            assert persisted.responded_at is None


# --- Service layer: the exact code path the operator route calls ---------


async def _run_submit_raw(request_id: uuid.UUID, now: datetime) -> bool:
    session = _session_factory()
    try:
        return await try_submit_contractor_response(session, request_id, **_submit_kwargs(now))
    finally:
        await session.close()


async def _run_service_revoke(contractor_request: ContractorRequest, now: datetime):
    """Uses the real service function (app.services.contractor_requests.
    revoke_contractor_request) — the exact function
    app/api/routes/operator_contractor_requests.py calls — not the bare
    repository primitive, so this proves the fix as actually wired into
    the route, not just the SQL statement in isolation."""
    session = _session_factory()
    try:
        # A freshly-loaded row in this session, mirroring how the route's
        # own _get_request_scoped_to_submission_or_404 loads it before
        # calling revoke_contractor_request — its in-memory
        # responded_at/revoked_at are whatever was true at load time, and
        # must NOT be trusted for the write decision (that's the bug).
        row = await get_contractor_request_by_id(session, contractor_request.id)
        try:
            result = await revoke_contractor_request(session, row, now)
            return ("revoked", result)
        except ConflictError as error:
            return ("conflict", str(error))
    finally:
        await session.close()


async def test_service_layer_revoke_concurrent_with_submit_never_produces_both_timestamps(
    db_session,
):
    for _ in range(10):
        submission = await _make_submission(db_session)
        contractor_request = await _make_request(db_session, submission)
        now = datetime.now(UTC)

        submitted, (revoke_outcome, _detail) = await asyncio.gather(
            _run_submit_raw(contractor_request.id, now),
            _run_service_revoke(contractor_request, now),
        )

        persisted = await get_contractor_request_by_id(db_session, contractor_request.id)
        await db_session.refresh(persisted)
        assert not (persisted.responded_at is not None and persisted.revoked_at is not None), (
            "row has BOTH responded_at and revoked_at set via the service layer — "
            "lifecycle invariant violated"
        )

        if submitted:
            # The submission won the race — the service-layer revoke must
            # have observed it as a conflict, never as a silent success,
            # and revoked_at must genuinely be unset.
            assert revoke_outcome == "conflict"
            assert persisted.responded_at is not None
            assert persisted.revoked_at is None
        else:
            # The service-layer revoke won the race.
            assert revoke_outcome == "revoked"
            assert persisted.revoked_at is not None
            assert persisted.responded_at is None
