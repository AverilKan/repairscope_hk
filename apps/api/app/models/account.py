import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AccountRole, AccountStatus, AccountType, MembershipStatus


class Account(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts"

    name: Mapped[str] = mapped_column(String, nullable=False)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
    )
    status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=AccountStatus.active,
        server_default=AccountStatus.active.value,
    )

    memberships: Mapped[list["AccountMembership"]] = relationship(
        back_populates="account", foreign_keys="AccountMembership.account_id"
    )


class AccountMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "account_memberships"
    __table_args__ = (
        # One *active* membership per (account, user). A removed/suspended
        # membership can coexist with a later re-invited/active one.
        Index(
            "ix_account_memberships_active_unique",
            "account_id",
            "user_id",
            unique=True,
            postgresql_where="status = 'active'",
        ),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[AccountRole] = mapped_column(
        Enum(AccountRole, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
    )
    status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=MembershipStatus.invited,
        server_default=MembershipStatus.invited.value,
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    account: Mapped["Account"] = relationship(
        back_populates="memberships", foreign_keys=[account_id]
    )
