import uuid

import pytest
from httpx import AsyncClient


async def test_create_artist_admin(client: AsyncClient, admin_headers):
    response = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Test Artist", "bio": "A test artist"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Artist"
    assert data["bio"] == "A test artist"
    assert "id" in data


async def test_create_artist_non_admin(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/artists",
        headers=auth_headers,
        json={"name": "Test Artist"},
    )
    assert response.status_code == 403


async def test_list_artists(client: AsyncClient, admin_headers):
    await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Artist One"},
    )
    await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Artist Two"},
    )
    response = await client.get("/api/v1/artists")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


async def test_get_artist(client: AsyncClient, admin_headers):
    create_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Get Me Artist"},
    )
    artist_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/artists/{artist_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Get Me Artist"


async def test_get_artist_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/artists/{fake_id}")
    assert response.status_code == 404


async def test_update_artist(client: AsyncClient, admin_headers):
    create_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Original Name"},
    )
    artist_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/artists/{artist_id}",
        headers=admin_headers,
        json={"name": "Updated Name", "bio": "New bio"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    assert response.json()["bio"] == "New bio"


async def test_delete_artist(client: AsyncClient, admin_headers):
    create_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Delete Me"},
    )
    artist_id = create_resp.json()["id"]

    response = await client.delete(
        f"/api/v1/artists/{artist_id}",
        headers=admin_headers,
    )
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/artists/{artist_id}")
    assert get_resp.status_code == 404
