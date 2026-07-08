import pytest
from httpx import AsyncClient

from app.core.security import create_refresh_token


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


async def test_register_duplicate_email(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "StrongPass1!",
            "pseudo": "anotheruser",
        },
    )
    assert response.status_code == 409


async def test_register_duplicate_pseudo(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "different@example.com",
            "password": "StrongPass1!",
            "pseudo": "testuser",
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
    response = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["pseudo"] == "testuser"


async def test_get_me_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_refresh_token(client: AsyncClient, test_user):
    refresh_token = create_refresh_token(str(test_user.id))
    response = await client.post(
        f"/api/v1/auth/refresh?token={refresh_token}",
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
