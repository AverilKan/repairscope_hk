import uuid
from datetime import datetime

from pydantic import BaseModel


class CapabilitySummary(BaseModel):
    capability: str
    source: str
    granted_at: datetime


class AccountMembershipSummary(BaseModel):
    account_id: uuid.UUID
    account_name: str
    role: str


class MeResponse(BaseModel):
    id: uuid.UUID
    display_name: str | None
    primary_email: str | None
    capabilities: list[CapabilitySummary]
    account_memberships: list[AccountMembershipSummary]
