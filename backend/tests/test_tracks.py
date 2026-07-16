import uuid

import pytest
from httpx import AsyncClient


async def _create_artist(client, admin_headers):
    resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Track Test Artist"},
    )
    return resp.json()["id"]


async def test_create_track(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    response = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Test Track",
            "artist_id": str(artist_id),
            "duration_seconds": 200,
            "genre": "rock",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Track"
    assert data["duration_seconds"] == 200
    assert data["genre"] == "rock"


async def test_list_tracks(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "List Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    response = await client.get("/api/v1/tracks", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


async def test_list_tracks_filter_genre(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Rock Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
            "genre": "rock",
        },
    )
    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Jazz Track",
            "artist_id": str(artist_id),
            "duration_seconds": 240,
            "genre": "jazz",
        },
    )

    response = await client.get("/api/v1/tracks?genre=rock", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["genre"] == "rock"


async def test_list_tracks_filter_artist(client: AsyncClient, admin_headers):
    artist1_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Filter Artist One"},
    )
    artist1_id = artist1_resp.json()["id"]

    artist2_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Filter Artist Two"},
    )
    artist2_id = artist2_resp.json()["id"]

    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Artist One Track",
            "artist_id": str(artist1_id),
            "duration_seconds": 180,
        },
    )
    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Artist Two Track",
            "artist_id": str(artist2_id),
            "duration_seconds": 200,
        },
    )

    response = await client.get(f"/api/v1/tracks?artist_id={artist1_id}", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["artist_id"] == str(artist1_id)


async def test_get_track(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Get Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/tracks/{track_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Get Track"


async def test_get_track_not_found(client: AsyncClient, admin_headers):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/tracks/{fake_id}", headers=admin_headers)
    assert response.status_code == 404


async def test_update_track(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Original Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/tracks/{track_id}",
        headers=admin_headers,
        json={"title": "Updated Track", "genre": "electronic"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Track"
    assert response.json()["genre"] == "electronic"


async def test_delete_track(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Delete Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.delete(
        f"/api/v1/tracks/{track_id}",
        headers=admin_headers,
    )
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/tracks/{track_id}")
    assert get_resp.status_code == 404


async def test_play_track(client: AsyncClient, auth_headers, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Play Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.post(
        f"/api/v1/tracks/{track_id}/play",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Play recorded"


async def test_play_track_not_found(client: AsyncClient, auth_headers):
    fake_id = uuid.uuid4()
    response = await client.post(
        f"/api/v1/tracks/{fake_id}/play",
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_stream_track(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Stream Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
            "file_url": "audio/test.mp3",
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/tracks/{track_id}/stream", headers=admin_headers)
    assert response.status_code == 200
    assert "stream_url" in response.json()


async def test_stream_track_no_file(client: AsyncClient, admin_headers):
    artist_id = await _create_artist(client, admin_headers)
    create_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "No File Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    track_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/tracks/{track_id}/stream", headers=admin_headers)
    assert response.status_code == 404
