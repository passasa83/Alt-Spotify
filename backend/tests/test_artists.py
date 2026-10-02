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
    response = await client.get("/api/v1/artists", headers=admin_headers)
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

    response = await client.get(f"/api/v1/artists/{artist_id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Get Me Artist"


async def test_get_artist_not_found(client: AsyncClient, auth_headers):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/artists/{fake_id}", headers=auth_headers)
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

    get_resp = await client.get(f"/api/v1/artists/{artist_id}", headers=admin_headers)
    assert get_resp.status_code == 404


async def _artist_with_tracks(client, headers, name, plays_per_track):
    """An artist and an album holding one track per entry (None = no audio)."""
    artist_id = (await client.post("/api/v1/artists", headers=headers, json={"name": name})).json()["id"]
    album_id = (await client.post("/api/v1/albums", headers=headers, json={"title": f"{name} LP", "artist_id": artist_id})).json()["id"]
    for n, plays in enumerate(plays_per_track):
        track = {"title": f"{name} {n}", "artist_id": artist_id, "album_id": album_id, "duration_seconds": 60}
        if plays is not None:
            track["file_url"] = f"audio/{name}-{n}.mp3"
        track_id = (await client.post("/api/v1/tracks", headers=headers, json=track)).json()["id"]
        for _ in range(plays or 0):
            await client.post(f"/api/v1/tracks/{track_id}/play", headers=headers, json={"duration_listened_seconds": 30})
    return artist_id, album_id


async def test_list_artists_playable_by_popularity(client: AsyncClient, admin_headers):
    await _artist_with_tracks(client, admin_headers, "Aaa Quiet", [0])
    await _artist_with_tracks(client, admin_headers, "Zzz Loud", [2])
    await _artist_with_tracks(client, admin_headers, "Bbb Ghost", [None])
    await client.post("/api/v1/artists", headers=admin_headers, json={"name": "Ccc Nothing"})

    names = [a["name"] for a in (await client.get("/api/v1/artists?page_size=100", headers=admin_headers)).json()["items"]]
    assert names == ["Aaa Quiet", "Bbb Ghost", "Ccc Nothing", "Zzz Loud"]

    response = await client.get("/api/v1/artists?playable=true&sort=popular", headers=admin_headers)
    assert [a["name"] for a in response.json()["items"]] == ["Zzz Loud", "Aaa Quiet"]
    assert response.json()["total"] == 2


async def test_artist_albums_playable_hides_empty_albums(client: AsyncClient, admin_headers):
    artist_id, album_id = await _artist_with_tracks(client, admin_headers, "Band", [0])
    await client.post("/api/v1/albums", headers=admin_headers, json={"title": "Empty", "artist_id": artist_id})

    every = (await client.get(f"/api/v1/artists/{artist_id}/albums", headers=admin_headers)).json()
    assert every["total"] == 2
    playable = (await client.get(f"/api/v1/artists/{artist_id}/albums?playable=true", headers=admin_headers)).json()
    assert [a["title"] for a in playable["items"]] == ["Band LP"]
    assert playable["total"] == 1
