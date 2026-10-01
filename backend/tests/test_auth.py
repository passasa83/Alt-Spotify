from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.security import create_refresh_token
from app.models.admin_invite import AdminInviteToken
from app.models.user import User, UserRole


async def _invite(db_session, inviter, token="invite-token", **kwargs) -> AdminInviteToken:
    invite = AdminInviteToken(token=token, invited_by=inviter.id, **kwargs)
    db_session.add(invite)
    await db_session.flush()
    return invite


@pytest_asyncio.fixture
async def invite(db_session, test_user) -> AdminInviteToken:
    return await _invite(db_session, test_user)


def _register_body(email="new@example.com", pseudo="newuser", invite_token=None) -> dict:
    body = {"email": email, "password": "StrongPass1!", "pseudo": pseudo}
    if invite_token is not None:
        body["invite_token"] = invite_token
    return body


async def test_register_success(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "new@example.com",
            "password": "StrongPass1!",
            "pseudo": "newuser",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new@example.com"
    assert data["pseudo"] == "newuser"
    assert "id" in data


async def test_register_duplicate_email(client: AsyncClient, test_user, invite):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "StrongPass1!",
            "pseudo": "anotheruser",
            "invite_token": invite.token,
        },
    )
    assert response.status_code == 409


async def test_register_duplicate_pseudo(client: AsyncClient, test_user, invite):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "different@example.com",
            "password": "StrongPass1!",
            "pseudo": "testuser",
            "invite_token": invite.token,
        },
    )
    assert response.status_code == 409


async def test_login_success(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "TestPass123!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "WrongPassword1!",
        },
    )
    assert response.status_code == 401


async def test_login_nonexistent_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "nonexistent@example.com",
            "password": "SomePass1!",
        },
    )
    assert response.status_code == 401


async def test_get_me_authenticated(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["pseudo"] == "testuser"


async def test_get_me_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


async def test_refresh_token(client: AsyncClient, test_user):
    refresh_token = create_refresh_token(str(test_user.id))
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


async def test_first_user_becomes_admin_without_invite(client: AsyncClient, db_session):
    response = await client.post("/api/v1/auth/register", json=_register_body())
    assert response.status_code == 201
    user = (await db_session.execute(select(User).where(User.email == "new@example.com"))).scalar_one()
    assert user.role == UserRole.ADMIN


async def test_register_requires_invite_once_users_exist(client: AsyncClient, test_user):
    response = await client.post("/api/v1/auth/register", json=_register_body())
    assert response.status_code == 403


async def test_register_hides_existing_email_without_invite(client: AsyncClient, test_user):
    response = await client.post("/api/v1/auth/register", json=_register_body(email="test@example.com"))
    assert response.status_code == 403


async def test_register_with_invite(client: AsyncClient, db_session, invite):
    response = await client.post("/api/v1/auth/register", json=_register_body(invite_token=invite.token))
    assert response.status_code == 201
    user = (await db_session.execute(select(User).where(User.email == "new@example.com"))).scalar_one()
    assert user.role == UserRole.USER
    await db_session.refresh(invite)
    assert invite.use_count == 1
    assert str(invite.used_by) == str(user.id)


async def test_invite_cannot_be_reused(client: AsyncClient, invite):
    first = await client.post("/api/v1/auth/register", json=_register_body(invite_token=invite.token))
    assert first.status_code == 201
    second = await client.post(
        "/api/v1/auth/register",
        json=_register_body(email="other@example.com", pseudo="other", invite_token=invite.token),
    )
    assert second.status_code == 403


@pytest.mark.parametrize(
    "invite_kwargs",
    [
        {"is_revoked": True},
        {"expires_at": datetime.now() - timedelta(days=1)},
        {"email": "someone-else@example.com"},
    ],
    ids=["revoked", "expired", "other-email"],
)
async def test_register_rejects_unusable_invite(client: AsyncClient, db_session, test_user, invite_kwargs):
    invite = await _invite(db_session, test_user, **invite_kwargs)
    response = await client.post("/api/v1/auth/register", json=_register_body(invite_token=invite.token))
    assert response.status_code == 403


async def test_register_invite_email_is_case_insensitive(client: AsyncClient, db_session, test_user):
    invite = await _invite(db_session, test_user, email="New@Example.com")
    response = await client.post("/api/v1/auth/register", json=_register_body(invite_token=invite.token))
    assert response.status_code == 201


async def test_open_registration_setting(client: AsyncClient, test_user, monkeypatch):
    monkeypatch.setattr(settings, "OPEN_REGISTRATION", True)
    response = await client.post("/api/v1/auth/register", json=_register_body())
    assert response.status_code == 201
