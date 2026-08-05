import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Capability, CapabilitySource, CapabilityStatus, UserStatus


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    clerk_user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    primary_email: Mapped[str | None] = mapped_column(String, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=UserStatus.active,
        server_default=UserStatus.active.value,
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    capabilities: Mapped[list["UserCapability"]] = relationship(
        back_populates="user", foreign_keys="UserCapability.user_id"
    )


class UserCapability(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "user_capabilities"
    __table_args__ = (
        # Only one *active* row per (user, capability). A user may still
        # accumulate historical suspended/revoked rows for the same
        # capability over time (e.g. revoked then re-granted) — those are
        # kept for audit history, not collapsed into a single mutable row.
        Index(
            "ix_user_capabilities_active_unique",
            "user_id",
            "capability",
            unique=True,
            postgresql_where="status = 'active'",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    capability: Mapped[Capability] = mapped_column(
        Enum(Capability, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
    )
    status: Mapped[CapabilityStatus] = mapped_column(
        Enum(CapabilityStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=CapabilityStatus.active,
        server_default=CapabilityStatus.active.value,
    )
    source: Mapped[CapabilitySource] = mapped_column(
        Enum(CapabilitySource, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
    )
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="capabilities", foreign_keys=[user_id])
