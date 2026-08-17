import hashlib
import secrets

# 32 raw bytes -> secrets.token_urlsafe's base64-url encoding yields ~256
# bits of entropy, generated via the stdlib CSPRNG. No custom crypto — the
# same primitive already used elsewhere in this codebase for
# public_reference generation (app/services/repair_submissions.py), just at
# a length appropriate for a real access-control secret rather than a
# human-typeable reference.
_TOKEN_BYTES = 32


def generate_access_token() -> str:
    """A fresh, high-entropy, URL-safe raw contractor access token. Callers
    must persist only hash_access_token(token) — see that function's own
    docstring — and must return this raw value to the operator exactly
    once; it is never recoverable afterwards."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_access_token(token: str) -> str:
    """The only representation of a contractor access token that may ever
    be persisted. SHA-256 over the raw token, hex-encoded (64 characters) —
    a standard cryptographic hash, not a password hash with a salt/work
    factor: this token is a single, server-generated, maximum-entropy
    secret (never a human-chosen or low-entropy value), so there is no
    dictionary/brute-force risk a salted slow hash would defend against
    that 256 bits of entropy doesn't already make infeasible. A lookup is a
    plain hash-equality query against a unique index (see
    app/repositories/contractor_requests.py), not a constant-time
    comparison in application code — the index lookup itself does not leak
    timing information about which stored hash (if any) matches, since
    Postgres resolves it by exact index lookup rather than a linear
    comparison scan."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
