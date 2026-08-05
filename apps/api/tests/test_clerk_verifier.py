"""Production-verifier tests: exercise the real ClerkIdentityVerifier
against a locally generated RSA keypair and a temporary local JWKS HTTP
server. No live Clerk tenant, no FakeIdentityVerifier.

These prove the verifier's own behaviour (signature/issuer/expiry/azp/
audience/timeout handling, and how RepairScope's own user-status check
composes with it). They are NOT evidence of live Clerk integration — see
tests/test_live_clerk_manual.md (or the completion report) for that.
"""

import base64
import hashlib
import hmac
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth.clerk import ClerkIdentityVerifier
from app.auth.dependencies import get_identity_verifier
from app.auth.identity import InvalidBearerTokenError
from app.core.config import Settings
from app.main import app
from app.models.enums import UserStatus
from app.models.user import User

TEST_AUTHORIZED_ORIGIN = "http://localhost:3000"
OTHER_AUTHORIZED_ORIGIN = "http://localhost:4000"

# ---------------------------------------------------------------------------
# Local "fake Clerk" fixtures: RSA keypair + JWKS HTTP server
# ---------------------------------------------------------------------------


class _JWKSHandler(BaseHTTPRequestHandler):
    jwks_doc: dict = {}

    def do_GET(self):
        if self.path == "/.well-known/jwks.json":
            body = json.dumps(self.jwks_doc).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def _b64url_uint(n: int) -> str:
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class _FakeClerkServer:
    def __init__(self):
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.kid = "test-key-1"
        public_numbers = self.private_key.public_key().public_numbers()
        jwk = {
            "kty": "RSA",
            "kid": self.kid,
            "use": "sig",
            "alg": "RS256",
            "n": _b64url_uint(public_numbers.n),
            "e": _b64url_uint(public_numbers.e),
        }

        handler = type("Handler", (_JWKSHandler,), {"jwks_doc": {"keys": [jwk]}})
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.port = self.server.server_address[1]
        self.issuer = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()

    def make_token(self, claims_override=None, headers_override=None, key=None, alg="RS256") -> str:
        now = int(time.time())
        claims = {
            "sub": "user_fake_clerk_id",
            "iss": self.issuer,
            "iat": now,
            "exp": now + 300,
            "email": "test@example.com",
            "email_verified": True,
        }
        if claims_override:
            claims.update(claims_override)
        headers = {"kid": self.kid}
        if headers_override:
            headers.update(headers_override)
        return jwt.encode(claims, key or self.private_key, algorithm=alg, headers=headers)

    def make_hs256_token_manually(self, hmac_key: bytes) -> str:
        """Bypasses pyjwt.encode()'s own guard against using an asymmetric
        key as an HMAC secret — this is what an attacker attempting
        algorithm confusion would actually do (hand-craft the bytes)."""
        header = {"alg": "HS256", "typ": "JWT", "kid": self.kid}
        now = int(time.time())
        payload = {"sub": "attacker", "iss": self.issuer, "iat": now, "exp": now + 300}
        signing_input = (
            f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(payload).encode())}"
        )
        signature = hmac.new(hmac_key, signing_input.encode(), hashlib.sha256).digest()
        return f"{signing_input}.{_b64url(signature)}"


@pytest.fixture(scope="module")
def fake_clerk():
    server = _FakeClerkServer()
    yield server
    server.stop()


@pytest.fixture
def verifier(fake_clerk):
    settings = Settings(
        clerk_issuer=fake_clerk.issuer,
        clerk_authorized_parties=f"{TEST_AUTHORIZED_ORIGIN},{OTHER_AUTHORIZED_ORIGIN}",
    )
    return ClerkIdentityVerifier(settings)


# ---------------------------------------------------------------------------
# 1-9: core token validity
# ---------------------------------------------------------------------------


async def test_valid_rs256_token_is_accepted(fake_clerk, verifier):
    token = fake_clerk.make_token()
    identity = await verifier.verify_bearer_token(token)
    assert identity.external_user_id == "user_fake_clerk_id"
    assert identity.email == "test@example.com"
    assert identity.email_verified is True


async def test_expired_token_is_rejected(fake_clerk, verifier):
    token = fake_clerk.make_token({"exp": int(time.time()) - 100})
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_future_nbf_is_rejected(fake_clerk, verifier):
    token = fake_clerk.make_token({"nbf": int(time.time()) + 3600})
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_wrong_issuer_is_rejected(fake_clerk, verifier):
    token = fake_clerk.make_token({"iss": "https://not-our-clerk-instance.example.com"})
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_invalid_signature_is_rejected(fake_clerk, verifier):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = fake_clerk.make_token(key=other_key)
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_unknown_kid_is_rejected(fake_clerk, verifier):
    token = fake_clerk.make_token(headers_override={"kid": "does-not-exist"})
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_malformed_token_is_rejected(verifier):
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token("not-a-jwt-at-all")


async def test_missing_subject_is_rejected(fake_clerk, verifier):
    now = int(time.time())
    claims = {"iss": fake_clerk.issuer, "iat": now, "exp": now + 300}
    token = jwt.encode(
        claims, fake_clerk.private_key, algorithm="RS256", headers={"kid": fake_clerk.kid}
    )
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_non_rs256_algorithm_is_rejected(fake_clerk, verifier):
    public_pem = fake_clerk.private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    forged = fake_clerk.make_hs256_token_manually(public_pem)
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(forged)


# ---------------------------------------------------------------------------
# 10-12: authorized party (azp)
# ---------------------------------------------------------------------------


async def test_allowed_azp_is_accepted(fake_clerk, verifier):
    token = fake_clerk.make_token({"azp": TEST_AUTHORIZED_ORIGIN})
    identity = await verifier.verify_bearer_token(token)
    assert identity.external_user_id == "user_fake_clerk_id"


async def test_forbidden_azp_is_rejected(fake_clerk, verifier):
    token = fake_clerk.make_token({"azp": "https://attacker-frontend.example.com"})
    with pytest.raises(InvalidBearerTokenError):
        await verifier.verify_bearer_token(token)


async def test_missing_azp_is_accepted_per_documented_policy(fake_clerk, verifier):
    """Clerk does not guarantee azp is always present. Per Clerk's own
    guidance (docs/AUTHORIZATION_MODEL.md), only reject when azp IS
    present and doesn't match — a token with no azp claim at all passes
    this check (still subject to every other check)."""
    token = fake_clerk.make_token()  # no azp claim
    identity = await verifier.verify_bearer_token(token)
    assert identity.external_user_id == "user_fake_clerk_id"


# ---------------------------------------------------------------------------
# 13-15: audience
# ---------------------------------------------------------------------------


async def test_audience_configured_and_correct_is_accepted(fake_clerk):
    settings = Settings(
        clerk_issuer=fake_clerk.issuer,
        clerk_authorized_parties=TEST_AUTHORIZED_ORIGIN,
        clerk_audience="expected-audience",
    )
    verifier_with_aud = ClerkIdentityVerifier(settings)
    token = fake_clerk.make_token({"aud": "expected-audience"})
    identity = await verifier_with_aud.verify_bearer_token(token)
    assert identity.external_user_id == "user_fake_clerk_id"


async def test_audience_configured_and_incorrect_is_rejected(fake_clerk):
    settings = Settings(
        clerk_issuer=fake_clerk.issuer,
        clerk_authorized_parties=TEST_AUTHORIZED_ORIGIN,
        clerk_audience="expected-audience",
    )
    verifier_with_aud = ClerkIdentityVerifier(settings)
    token = fake_clerk.make_token({"aud": "some-other-audience"})
    with pytest.raises(InvalidBearerTokenError):
        await verifier_with_aud.verify_bearer_token(token)


async def test_audience_absent_but_token_has_aud_is_accepted(fake_clerk, verifier):
    """Regression test for the bug found during audit: when
    clerk_audience is unset, a token carrying ANY aud claim must still be
    accepted. PyJWT rejects any aud-bearing token whenever audience
    verification runs with an unspecified expected audience — regardless
    of whether audience=None is passed explicitly or omitted — so the fix
    is options={"verify_aud": False}, not omitting the kwarg."""
    token = fake_clerk.make_token({"aud": "anything-at-all"})
    identity = await verifier.verify_bearer_token(token)
    assert identity.external_user_id == "user_fake_clerk_id"


# ---------------------------------------------------------------------------
# 16-17: JWKS network failure / bounded timeout
# ---------------------------------------------------------------------------


async def test_jwks_network_failure_is_rejected_not_uncaught():
    # A closed server: connections to this port are refused immediately.
    probe = HTTPServer(("127.0.0.1", 0), _JWKSHandler)
    port = probe.server_address[1]
    probe.server_close()  # never served; port now refuses connections

    settings = Settings(
        clerk_issuer=f"http://127.0.0.1:{port}",
        clerk_authorized_parties=TEST_AUTHORIZED_ORIGIN,
    )
    verifier_unreachable = ClerkIdentityVerifier(settings)
    with pytest.raises(InvalidBearerTokenError):
        await verifier_unreachable.verify_bearer_token("irrelevant.payload.here")


async def test_jwks_fetch_has_a_bounded_timeout(monkeypatch):
    # A listener that accepts TCP connections but never sends an HTTP
    # response, to prove the fetch doesn't hang indefinitely. The module
    # timeout constant is patched down so this test stays fast.
    import app.auth.clerk as clerk_module

    monkeypatch.setattr(clerk_module, "_JWKS_FETCH_TIMEOUT_SECONDS", 1.0)

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]

    def _accept_and_hang():
        try:
            conn, _ = listener.accept()
            time.sleep(10)
            conn.close()
        except OSError:
            pass

    thread = threading.Thread(target=_accept_and_hang, daemon=True)
    thread.start()

    settings = Settings(
        clerk_issuer=f"http://127.0.0.1:{port}",
        clerk_authorized_parties=TEST_AUTHORIZED_ORIGIN,
    )
    verifier_hanging = clerk_module.ClerkIdentityVerifier(settings)

    started = time.monotonic()
    with pytest.raises(InvalidBearerTokenError):
        await verifier_hanging.verify_bearer_token("irrelevant.payload.here")
    elapsed = time.monotonic() - started

    listener.close()
    assert elapsed < 5.0, f"expected the fetch to bail out near the 1s timeout, took {elapsed:.1f}s"


# ---------------------------------------------------------------------------
# 18-20: RepairScope user status, exercised through the full auth dependency
# (verifier -> provisioning -> status check), still with no live Clerk tenant
# ---------------------------------------------------------------------------


@pytest.fixture
async def clerk_client(fake_clerk):
    """An httpx client wired to the real ClerkIdentityVerifier (pointed at
    the local fake JWKS server) instead of FakeIdentityVerifier."""
    from httpx import ASGITransport, AsyncClient

    settings = Settings(
        clerk_issuer=fake_clerk.issuer,
        clerk_authorized_parties=TEST_AUTHORIZED_ORIGIN,
    )
    real_verifier = ClerkIdentityVerifier(settings)
    app.dependency_overrides[get_identity_verifier] = lambda: real_verifier
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_identity_verifier, None)


async def test_suspended_repairscope_user_is_denied(fake_clerk, clerk_client, db_session):
    user = User(clerk_user_id="user_suspended_test", status=UserStatus.suspended)
    db_session.add(user)
    await db_session.commit()

    token = fake_clerk.make_token({"sub": "user_suspended_test"})
    response = await clerk_client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


async def test_deactivated_repairscope_user_is_denied(fake_clerk, clerk_client, db_session):
    user = User(clerk_user_id="user_deactivated_test", status=UserStatus.deactivated)
    db_session.add(user)
    await db_session.commit()

    token = fake_clerk.make_token({"sub": "user_deactivated_test"})
    response = await clerk_client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


async def test_active_repairscope_user_is_allowed(fake_clerk, clerk_client, db_session):
    user = User(clerk_user_id="user_active_test", status=UserStatus.active)
    db_session.add(user)
    await db_session.commit()

    token = fake_clerk.make_token({"sub": "user_active_test"})
    response = await clerk_client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


async def test_suspension_survives_reauthentication_no_reactivation(fake_clerk, db_session):
    """provision_user's upsert must never touch status — re-authenticating
    as a suspended user must not silently reactivate them."""
    from app.auth.identity import VerifiedExternalIdentity
    from app.auth.provisioning import provision_user

    user = User(clerk_user_id="user_stays_suspended", status=UserStatus.suspended)
    db_session.add(user)
    await db_session.commit()

    identity = VerifiedExternalIdentity(
        external_user_id="user_stays_suspended", email="s@example.com", email_verified=True
    )
    refreshed = await provision_user(db_session, identity)
    assert refreshed.status == UserStatus.suspended
