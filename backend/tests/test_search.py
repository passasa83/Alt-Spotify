import pytest
from httpx import AsyncClient


async def _seed_data(client, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Searchable Artist"},
    )
    artist_id = artist_resp.json()["id"]

    album_resp = await client.post(
        "/api/v1/albums",
        headers=admin_headers,
        json={"title": "Searchable Album", "artist_id": str(artist_id)},
    )
    album_id = album_resp.json()["id"]

    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Searchable Track",
            "artist_id": str(artist_id),
            "album_id": album_id,
            "duration_seconds": 180,
        },
    )

    return artist_id, album_id


async def test_search_tracks(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=tracks")
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert len(data["tracks"]) >= 1
    titles = [t["title"] for t in data["tracks"]]
    assert "Searchable Track" in titles


async def test_search_artists(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=artists")
    assert response.status_code == 200
    data = response.json()
    assert "artists" in data
    assert len(data["artists"]) >= 1
    assert data["artists"][0]["name"] == "Searchable Artist"


async def test_search_albums(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=albums")
    assert response.status_code == 200
    data = response.json()
    assert "albums" in data
    assert len(data["albums"]) >= 1
    assert data["albums"][0]["title"] == "Searchable Album"


async def test_search_empty(client: AsyncClient):
    response = await client.get("/api/v1/search?q=xyznonexistent&type=tracks,artists,albums")
    assert response.status_code == 200
    data = response.json()
    for key in ("tracks", "artists", "albums"):
        if key in data:
            assert len(data[key]) == 0


async def test_search_multiple_types(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=tracks,artists,albums")
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert "artists" in data
    assert "albums" in data
