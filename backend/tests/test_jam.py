import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole


async def test_create_session(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert "session_id" in data
    assert "code" in data
    assert data["status"] == "ACTIVE"


async def test_join_session(client: AsyncClient, auth_headers, test_user, db_session):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_data = create_resp.json()
    code = session_data["code"]

    other = User(
        id=uuid.uuid4(),
        email="joiner@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="joiner",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()

    other_token = create_access_token(str(other.id))
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = await client.post(
        f"/api/v1/jam/join/{code}",
        headers=other_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_data["session_id"]
    assert data["code"] == code


async def test_join_session_invalid_code(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/jam/join/INVALID",
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_leave_session(client: AsyncClient, auth_headers, test_user):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_id = create_resp.json()["session_id"]

    response = await client.post(
        f"/api/v1/jam/leave/{session_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Left session"


async def test_get_session(client: AsyncClient, auth_headers):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_id = create_resp.json()["session_id"]

    response = await client.get(f"/api/v1/jam/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id
    assert "participants" in data
    assert len(data["participants"]) >= 1


async def test_get_session_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/jam/{fake_id}")
    assert response.status_code == 404
