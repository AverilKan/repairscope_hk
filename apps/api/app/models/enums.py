import enum


class UserStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"
    deactivated = "deactivated"


class Capability(enum.StrEnum):
    landlord = "landlord"
    contractor = "contractor"
    operator = "operator"


class CapabilityStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"
    revoked = "revoked"


class CapabilitySource(enum.StrEnum):
    signup = "signup"
    invitation = "invitation"
    operator_grant = "operator_grant"
    system = "system"


class AccountType(enum.StrEnum):
    individual_landlord = "individual_landlord"
    landlord_business = "landlord_business"
    letting_agent = "letting_agent"
    property_manager = "property_manager"


class AccountStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"
    closed = "closed"


class AccountRole(enum.StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"


class MembershipStatus(enum.StrEnum):
    invited = "invited"
    active = "active"
    suspended = "suspended"
    removed = "removed"


class PropertyStatus(enum.StrEnum):
    active = "active"
    archived = "archived"


class PropertyPermission(enum.StrEnum):
    viewer = "viewer"
    manager = "manager"


class GrantStatus(enum.StrEnum):
    active = "active"
    revoked = "revoked"
