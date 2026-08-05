import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GrantStatus, PropertyPermission, PropertyStatus


class Property(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "properties"

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True
    )
    reference: Mapped[str | None] = mapped_column(String, nullable=True)
    address_line_1: Mapped[str] = mapped_column(String, nullable=False)
    address_line_2: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str] = mapped_column(String, nullable=False)
    postcode: Mapped[str] = mapped_column(String, nullable=False, index=True)
    country_code: Mapped[str] = mapped_column(
        String, nullable=False, default="GB", server_default="GB"
    )
    status: Mapped[PropertyStatus] = mapped_column(
        Enum(PropertyStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=PropertyStatus.active,
        server_default=PropertyStatus.active.value,
    )

    access_grants: Mapped[list["PropertyAccessGrant"]] = relationship(
        back_populates="property", foreign_keys="PropertyAccessGrant.property_id"
    )


class PropertyAccessGrant(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "property_access_grants"
    __table_args__ = (
        # One *active* grant per (property, user); a revoked grant can
        # coexist with a later re-granted active one.
        Index(
            "ix_property_access_grants_active_unique",
            "property_id",
            "user_id",
            unique=True,
            postgresql_where="status = 'active'",
        ),
    )

    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    permission: Mapped[PropertyPermission] = mapped_column(
        Enum(PropertyPermission, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
    )
    status: Mapped[GrantStatus] = mapped_column(
        Enum(GrantStatus, native_enum=False, validate_strings=True, create_constraint=True),
        nullable=False,
        default=GrantStatus.active,
        server_default=GrantStatus.active.value,
    )
    granted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    property: Mapped["Property"] = relationship(
        back_populates="access_grants", foreign_keys=[property_id]
    )
