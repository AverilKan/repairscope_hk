from app.auth.identity import VerifiedExternalIdentity
from app.auth.provisioning import provision_user
from app.repositories.users import get_user_by_id


async def test_valid_external_identity_provisions_a_repairscope_user(db_session):
    identity = VerifiedExternalIdentity(
        external_user_id="clerk_new_user", email="new@example.com", email_verified=True
    )

    user = await provision_user(db_session, identity)

    assert user.clerk_user_id == "clerk_new_user"
    assert user.primary_email == "new@example.com"
    stored = await get_user_by_id(db_session, user.id)
    assert stored is not None
    assert stored.clerk_user_id == "clerk_new_user"


async def test_repeated_authentication_does_not_create_duplicate_users(db_session):
    first_identity = VerifiedExternalIdentity(
        external_user_id="clerk_repeat", email="first@example.com", email_verified=True
    )
    second_identity = VerifiedExternalIdentity(
        external_user_id="clerk_repeat", email="second@example.com", email_verified=True
    )

    first_user = await provision_user(db_session, first_identity)
    second_user = await provision_user(db_session, second_identity)

    assert first_user.id == second_user.id
    assert second_user.primary_email == "second@example.com"
