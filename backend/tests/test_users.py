import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.user import User, UserRole


async def test_get_me(client: AsyncClient, auth_headers, test_user):
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["pseudo"] == "testuser"


async def test_update_profile(client: AsyncClient, auth_headers, test_user):
    response = await client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={"pseudo": "newpseudo", "avatar_url": "http://example.com/avatar.jpg"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["pseudo"] == "newpseudo"
    assert data["avatar_url"] == "http://example.com/avatar.jpg"


async def test_update_profile_duplicate_pseudo(client: AsyncClient, auth_headers, test_user, db_session):
    other = User(
        id=uuid.uuid4(),
        email="other@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="takenname",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()

    response = await client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={"pseudo": "takenname"},
    )
    assert response.status_code == 409


async def test_get_user_by_id(client: AsyncClient, test_user):
    response = await client.get(f"/api/v1/users/{test_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


async def test_get_user_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/users/{fake_id}")
    assert response.status_code == 404


async def test_get_stats(client: AsyncClient, auth_headers, test_user):
    response = await client.get("/api/v1/users/me/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_tracks" in data
    assert "top_artists" in data
    assert "total_listening_seconds" in data
    assert "listening_streak" in data
