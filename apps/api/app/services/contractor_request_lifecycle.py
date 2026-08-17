import enum
from datetime import datetime

# A single small pilot default, not an environment variable — easy to
# change later (see the architecture review's Task 4/8 discussion: exact
# duration is a product decision, not an architectural one, and this is a
# validation-stage pilot with one operator).
DEFAULT_CONTRACTOR_REQUEST_TTL_DAYS = 7


class ContractorRequestStatus(enum.StrEnum):
    """Derived, not persisted — see app/models/contractor_request.py's
    module docstring. Computed fresh from responded_at/revoked_at/
    expires_at every time, so it can never drift out of sync with the
    timestamp that actually caused a transition."""

    open = "open"
    responded = "responded"
    revoked = "revoked"
    expired = "expired"


def derive_status(
    *,
    responded_at: datetime | None,
    revoked_at: datetime | None,
    expires_at: datetime,
    now: datetime,
) -> ContractorRequestStatus:
    """Precedence, checked in order:

    1. responded_at set -> RESPONDED, unconditionally. A committed response
       is a historical fact; nothing (a later revoke, an expired clock)
       retroactively erases it. The atomic first-write-wins submission
       guard (app/services/contractor_requests.py) is what prevents
       responded_at and revoked_at from both being set in the first place
       — this precedence is the defensive fallback if that invariant were
       ever somehow violated (e.g. direct DB manipulation), and it fails
       toward the safer reading: a response that was already reviewable
       stays reviewable rather than silently disappearing behind a
       "revoked" label.
    2. revoked_at set (and no response) -> REVOKED, unconditionally —
       an operator's explicit revoke always wins over expiry.
    3. expires_at <= now (and neither of the above) -> EXPIRED.
    4. otherwise -> OPEN.
    """
    if responded_at is not None:
        return ContractorRequestStatus.responded
    if revoked_at is not None:
        return ContractorRequestStatus.revoked
    if expires_at <= now:
        return ContractorRequestStatus.expired
    return ContractorRequestStatus.open
