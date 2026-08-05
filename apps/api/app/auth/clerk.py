import asyncio
import logging

import jwt
from jwt import PyJWKClient

from app.auth.identity import IdentityVerifier, InvalidBearerTokenError, VerifiedExternalIdentity
from app.core.config import Settings

logger = logging.getLogger("repairscope.auth.clerk")

_JWKS_CLIENT_CACHE_SECONDS = 300
_JWKS_FETCH_TIMEOUT_SECONDS = 5.0


def _parse_authorized_parties(raw: str) -> frozenset[str]:
    return frozenset(origin.strip() for origin in raw.split(",") if origin.strip())


class ClerkIdentityVerifier(IdentityVerifier):
    """Verifies a Clerk session JWT: RS256 signature against the issuer's
    JWKS, issuer, expiry (with clock-skew leeway), subject, and — when the
    token carries one — the azp (authorized party) claim against a
    configured allow-list. Exercised in this repository only against a
    real Clerk *development* tenant and a committed local-JWKS test suite
    (tests/test_clerk_verifier.py); there is no production tenant or
    production activation here.

    All failures raise InvalidBearerTokenError with a fixed generic
    message — the caller (app/auth/dependencies.py) turns that into a
    plain 401 with no low-level JWT/network detail. Specific failure
    categories are logged server-side only (never the token itself); see
    _fail() below.
    """

    def __init__(self, settings: Settings):
        if not settings.clerk_issuer:
            raise ValueError(
                "ClerkIdentityVerifier requires REPAIRSCOPE_CLERK_ISSUER to be set."
            )
        if not settings.clerk_authorized_parties:
            raise ValueError(
                "ClerkIdentityVerifier requires REPAIRSCOPE_CLERK_AUTHORIZED_PARTIES "
                "to be set (comma-separated allowed frontend origins)."
            )
        self._issuer = settings.clerk_issuer
        self._audience = settings.clerk_audience
        self._authorized_parties = _parse_authorized_parties(settings.clerk_authorized_parties)
        self._clock_skew_seconds = settings.clerk_clock_skew_seconds
        self._jwks_client = PyJWKClient(
            f"{self._issuer.rstrip('/')}/.well-known/jwks.json",
            cache_keys=True,
            lifespan=_JWKS_CLIENT_CACHE_SECONDS,
            timeout=_JWKS_FETCH_TIMEOUT_SECONDS,
        )

    def _fail(self, category: str, error: Exception | None = None) -> InvalidBearerTokenError:
        # Log an operational category only — never the token, never the
        # raw exception text (which can embed claim values).
        logger.info("clerk_token_rejected category=%s", category)
        return InvalidBearerTokenError("Invalid or expired credentials.")

    async def verify_bearer_token(self, token: str) -> VerifiedExternalIdentity:
        try:
            # PyJWKClient's key resolution (and the JWKS fetch behind it on
            # a cache miss) is synchronous network I/O — running it
            # directly here would block the FastAPI event loop for the
            # duration of the request. asyncio.to_thread moves it to a
            # worker thread; _JWKS_FETCH_TIMEOUT_SECONDS bounds how long
            # that can take.
            signing_key = await asyncio.to_thread(self._jwks_client.get_signing_key_from_jwt, token)
        except jwt.PyJWKClientConnectionError as error:
            raise self._fail("jwks_network_error", error) from error
        except jwt.PyJWKClientError as error:
            raise self._fail("unknown_key_id", error) from error
        except jwt.PyJWTError as error:
            raise self._fail("malformed_token", error) from error

        decode_kwargs: dict = {
            "algorithms": ["RS256"],
            "issuer": self._issuer,
            "leeway": self._clock_skew_seconds,
            "options": {"require": ["exp", "iat", "sub"]},
        }
        # Only ask PyJWT to enforce an audience when one is actually
        # configured. PyJWT's _validate_claims calls _validate_aud
        # whenever options["verify_aud"] is true (the default) — and
        # _validate_aud rejects ANY token with an aud claim if the caller
        # passed audience=None, *whether or not audience= was explicitly
        # passed* (confirmed by reading jwt.api_jwt.PyJWT._validate_aud:
        # `if audience is None: if "aud" in payload: raise
        # InvalidAudienceError`). Simply omitting the audience= kwarg does
        # NOT fix this — the only way to accept an aud-bearing token when
        # we haven't been told what audience to expect is to disable
        # audience verification outright via options["verify_aud"].
        if self._audience:
            decode_kwargs["audience"] = self._audience
        else:
            decode_kwargs["options"]["verify_aud"] = False

        try:
            claims = jwt.decode(token, signing_key.key, **decode_kwargs)
        except jwt.ExpiredSignatureError as error:
            raise self._fail("expired", error) from error
        except jwt.InvalidIssuerError as error:
            raise self._fail("wrong_issuer", error) from error
        except jwt.InvalidAudienceError as error:
            raise self._fail("wrong_audience", error) from error
        except jwt.InvalidSignatureError as error:
            raise self._fail("invalid_signature", error) from error
        except jwt.MissingRequiredClaimError as error:
            raise self._fail("missing_required_claim", error) from error
        except jwt.InvalidAlgorithmError as error:
            raise self._fail("disallowed_algorithm", error) from error
        except jwt.PyJWTError as error:
            raise self._fail("token_invalid", error) from error

        subject = claims.get("sub")
        if not subject or not isinstance(subject, str):
            raise self._fail("missing_subject")

        azp = claims.get("azp")
        if azp is not None and azp not in self._authorized_parties:
            # Per Clerk's own documented guidance: only reject when azp is
            # present and doesn't match a known origin. A token with no
            # azp claim at all is not rejected on that basis alone — Clerk
            # does not guarantee azp is always present.
            raise self._fail("unauthorized_party")

        email = claims.get("email")
        email_verified = bool(claims.get("email_verified", False))
        return VerifiedExternalIdentity(
            external_user_id=subject,
            email=email if isinstance(email, str) else None,
            email_verified=email_verified,
        )
