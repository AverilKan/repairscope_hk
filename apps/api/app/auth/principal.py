import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    """The only representation of "who is making this request" that
    authorization code should ever see. Built exclusively from a verified
    identity plus persisted RepairScope records — never from anything the
    client sent in the request body or query string."""

    clerk_user_id: str
    repairscope_user_id: uuid.UUID
    email_verified: bool
