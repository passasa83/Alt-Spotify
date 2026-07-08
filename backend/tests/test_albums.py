import uuid

import pytest
from httpx import AsyncClient


async def _create_artist(client, admin_headers):
    resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Album Test Artist"},
    )
    return resp.json()["id"]


async def test_create_album_admin(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    response = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={
            "title": "Test Album",
            "artist_id": str(artist_id),
            "release_date": "2024-01-15",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Album"
    assert data["artist_id"] == str(artist_id)


async def test_create_album_non_admin(client: AsyncClient, auth_headers, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    response = await client.post(
        "/api/v1/albums",
        headers=auth_headers,
        json={
            "title": "Test Album",
            "artist_id": str(artist_id),
        },
    )
    assert response.status_code == 403


async def test_list_albums(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Album One", "artist_id": str(artist_id)},
    )
    response = await client.get("/api/v1/albums")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


async def test_get_album(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Get Me Album", "artist_id": str(artist_id)},
    )
    album_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/albums/{album_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Get Me Album"


async def test_get_album_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/albums/{fake_id}")
    assert response.status_code == 404


async def test_get_album_tracks(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    album_resp = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Tracks Album", "artist_id": str(artist_id)},
    )
    album_id = album_resp.json()["id"]

    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Album Track",
            "artist_id": str(artist_id),
            "album_id": album_id,
            "duration_seconds": 180,
        },
    )

    response = await client.get(f"/api/v1/albums/{album_id}/tracks")
    assert response.status_code == 200
    tracks = response.json()
    assert len(tracks) >= 1
    assert tracks[0]["title"] == "Album Track"


async def test_update_album(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Original Album", "artist_id": str(artist_id)},
    )
    album_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/albums/{album_id}",
        headers=admin_headers,
        json={"title": "Updated Album"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Album"


async def test_delete_album(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Delete Album", "artist_id": str(artist_id)},
    )
    album_id = create_resp.json()["id"]

    response = await client.delete(
        f"/api/v1/albums/{album_id}",
        headers=admin_headers,
    )
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/albums/{album_id}")
    assert get_resp.status_code == 404
