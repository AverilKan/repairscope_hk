from datetime import UTC, datetime

import pytest

from app.core.errors import ForbiddenError
from app.models.account import Account, AccountMembership
from app.models.enums import (
    AccountRole,
    AccountStatus,
    AccountType,
    Capability,
    CapabilitySource,
    CapabilityStatus,
    GrantStatus,
    MembershipStatus,
    PropertyPermission,
    PropertyStatus,
    UserStatus,
)
from app.models.property import Property, PropertyAccessGrant
from app.models.user import User, UserCapability
from app.services.authorization import AuthorizationService


async def _user(session, clerk_id: str) -> User:
    user = User(clerk_user_id=clerk_id, status=UserStatus.active)
    session.add(user)
    await session.flush()
    return user


async def _account(session, name: str = "Acme") -> Account:
    account = Account(
        name=name, account_type=AccountType.letting_agent, status=AccountStatus.active
    )
    session.add(account)
    await session.flush()
    return account


async def _membership(
    session, account: Account, user: User, role: AccountRole
) -> AccountMembership:
    membership = AccountMembership(
        account_id=account.id, user_id=user.id, role=role, status=MembershipStatus.active
    )
    session.add(membership)
    await session.flush()
    return membership


async def _property(session, account: Account, postcode: str = "LS1 1AA") -> Property:
    prop = Property(
        account_id=account.id,
        address_line_1="1 Test St",
        city="Leeds",
        postcode=postcode,
        status=PropertyStatus.active,
    )
    session.add(prop)
    await session.flush()
    return prop


async def _grant(
    session, prop: Property, user: User, permission: PropertyPermission, granter: User
):
    grant = PropertyAccessGrant(
        property_id=prop.id,
        user_id=user.id,
        permission=permission,
        status=GrantStatus.active,
        granted_by_user_id=granter.id,
    )
    session.add(grant)
    await session.flush()
    return grant


async def test_account_owner_can_access_account_property(db_session):
    owner = await _user(db_session, "clerk_owner_7")
    account = await _account(db_session)
    await _membership(db_session, account, owner, AccountRole.owner)
    prop = await _property(db_session, account)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_view_property(owner.id, prop.id) is True
    assert await authz.can_manage_property(owner.id, prop.id) is True


async def test_account_admin_can_manage_account_property(db_session):
    admin = await _user(db_session, "clerk_admin_8")
    account = await _account(db_session)
    await _membership(db_session, account, admin, AccountRole.admin)
    prop = await _property(db_session, account)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_manage_property(admin.id, prop.id) is True


async def test_account_member_can_view_but_not_manage_account_property(db_session):
    member = await _user(db_session, "clerk_member_9")
    account = await _account(db_session)
    await _membership(db_session, account, member, AccountRole.member)
    prop = await _property(db_session, account)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_view_property(member.id, prop.id) is True
    assert await authz.can_manage_property(member.id, prop.id) is False


async def test_property_viewer_grant_can_view_only_the_granted_property(db_session):
    owner = await _user(db_session, "clerk_owner_10")
    viewer = await _user(db_session, "clerk_viewer_10")
    account = await _account(db_session)
    await _membership(db_session, account, owner, AccountRole.owner)
    granted_property = await _property(db_session, account, postcode="LS1 1AA")
    other_property = await _property(db_session, account, postcode="LS2 2BB")
    await _grant(db_session, granted_property, viewer, PropertyPermission.viewer, owner)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_view_property(viewer.id, granted_property.id) is True
    assert await authz.can_manage_property(viewer.id, granted_property.id) is False
    # Not a member of the account, and no grant on the other property.
    assert await authz.can_view_property(viewer.id, other_property.id) is False


async def test_property_manager_grant_can_manage_only_the_granted_property(db_session):
    owner = await _user(db_session, "clerk_owner_11")
    manager = await _user(db_session, "clerk_manager_11")
    account = await _account(db_session)
    await _membership(db_session, account, owner, AccountRole.owner)
    granted_property = await _property(db_session, account, postcode="LS1 1AA")
    other_property = await _property(db_session, account, postcode="LS3 3CC")
    await _grant(db_session, granted_property, manager, PropertyPermission.manager, owner)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_manage_property(manager.id, granted_property.id) is True
    assert await authz.can_view_property(manager.id, granted_property.id) is True
    assert await authz.can_manage_property(manager.id, other_property.id) is False
    assert await authz.can_view_property(manager.id, other_property.id) is False


async def test_user_without_membership_or_grant_cannot_access_the_property(db_session):
    account = await _account(db_session)
    prop = await _property(db_session, account)
    outsider = await _user(db_session, "clerk_outsider_12")
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_view_property(outsider.id, prop.id) is False
    assert await authz.can_manage_property(outsider.id, prop.id) is False


async def test_contractor_capability_alone_grants_no_property_access(db_session):
    contractor = await _user(db_session, "clerk_contractor_13")
    db_session.add(
        UserCapability(
            user_id=contractor.id,
            capability=Capability.contractor,
            status=CapabilityStatus.active,
            source=CapabilitySource.invitation,
            granted_at=datetime.now(UTC),
        )
    )
    account = await _account(db_session)
    prop = await _property(db_session, account)
    await db_session.commit()

    authz = AuthorizationService(db_session)
    assert await authz.can_view_property(contractor.id, prop.id) is False
    assert await authz.can_manage_property(contractor.id, prop.id) is False


async def test_operator_access_requires_an_explicit_operator_check(db_session):
    operator = await _user(db_session, "clerk_operator_14")
    non_operator = await _user(db_session, "clerk_non_operator_14")
    db_session.add(
        UserCapability(
            user_id=operator.id,
            capability=Capability.operator,
            status=CapabilityStatus.active,
            source=CapabilitySource.operator_grant,
            granted_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    authz = AuthorizationService(db_session)
    await authz.require_operator(operator.id)  # does not raise

    with pytest.raises(ForbiddenError):
        await authz.require_operator(non_operator.id)
