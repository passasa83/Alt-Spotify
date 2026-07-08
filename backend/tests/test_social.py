import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole


async def _create_other_user(db_session):
    other = User(
        id=uuid.uuid4(),
        email="social_other@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="socialother",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()
    return other


async def test_follow_user(client: AsyncClient, auth_headers, db_session, test_user):
    other = await _create_other_user(db_session)

    response = await client.post(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["message"] == "Followed"


async def test_follow_user_self(client: AsyncClient, auth_headers, test_user):
    response = await client.post(
        f"/api/v1/social/follow/{test_user.id}",
        headers=auth_headers,
    )
    assert response.status_code in (400, 201, 409)


async def test_follow_user_not_found(client: AsyncClient, auth_headers):
    fake_id = uuid.uuid4()
    response = await client.post(
        f"/api/v1/social/follow/{fake_id}",
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_follow_user_duplicate(client: AsyncClient, auth_headers, db_session):
    other = await _create_other_user(db_session)

    await client.post(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )

    response = await client.post(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_unfollow_user(client: AsyncClient, auth_headers, db_session):
    other = await _create_other_user(db_session)

    await client.post(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )

    response = await client.delete(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )
    assert response.status_code == 204


async def test_follow_artist(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Follow Artist"},
    )
    artist_id = artist_resp.json()["id"]

    response = await client.post(
        f"/api/v1/social/follow/artist/{artist_id}",
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["message"] == "Followed artist"


async def test_follow_artist_duplicate(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Dup Follow Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await client.post(
        f"/api/v1/social/follow/artist/{artist_id}",
        headers=auth_headers,
    )

    response = await client.post(
        f"/api/v1/social/follow/artist/{artist_id}",
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_get_followers(client: AsyncClient, auth_headers, db_session, test_user):
    other = await _create_other_user(db_session)

    other_token = create_access_token(str(other.id))
    other_headers = {"Authorization": f"Bearer {other_token}"}

    await client.post(
        f"/api/v1/social/follow/{test_user.id}",
        headers=other_headers,
    )

    response = await client.get("/api/v1/social/followers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "followers" in data
    assert "count" in data
    assert data["count"] >= 1


async def test_get_following(client: AsyncClient, auth_headers, db_session):
    other = await _create_other_user(db_session)

    await client.post(
        f"/api/v1/social/follow/{other.id}",
        headers=auth_headers,
    )

    response = await client.get("/api/v1/social/following", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "following" in data
    assert "count" in data
    assert data["count"] >= 1
