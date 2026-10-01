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

    response = await client.get("/api/v1/search?q=Searchable&type=tracks", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert len(data["tracks"]) >= 1
    titles = [t["title"] for t in data["tracks"]]
    assert "Searchable Track" in titles


async def test_search_artists(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=artists", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "artists" in data
    assert len(data["artists"]) >= 1
    assert data["artists"][0]["name"] == "Searchable Artist"


async def test_search_albums(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=albums", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "albums" in data
    assert len(data["albums"]) >= 1
    assert data["albums"][0]["title"] == "Searchable Album"


async def test_search_empty(client: AsyncClient, admin_headers):
    response = await client.get("/api/v1/search?q=xyznonexistent&type=tracks,artists,albums", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    for key in ("tracks", "artists", "albums"):
        if key in data:
            assert len(data[key]) == 0


async def test_search_multiple_types(client: AsyncClient, admin_headers):
    await _seed_data(client, admin_headers)

    response = await client.get("/api/v1/search?q=Searchable&type=tracks,artists,albums", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert "artists" in data
    assert "albums" in data


async def test_search_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/search?q=anything")
    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/search/jiosaavn?q=x", "/api/v1/search/enriched?q=x"])
async def test_import_searches_require_admin(client: AsyncClient, auth_headers, path):
    response = await client.get(path, headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.parametrize(
    "preview_url",
    [
        "http://169.254.169.254/latest/meta-data/",
        "https://minio:9000/alt-spotify/secret",
        "https://evil.com/x.dzcdn.net.mp3",
        "https://dzcdn.net.evil.com/preview.mp3",
        "http://cdns-preview-1.dzcdn.net/stream/preview.mp3",
    ],
)
async def test_download_deezer_only_fetches_deezer_cdn(client: AsyncClient, admin_headers, preview_url):
    response = await client.post(
        "/api/v1/search/download-deezer",
        headers=admin_headers,
        params={"deezer_id": 1, "title": "T", "artist_name": "A", "preview_url": preview_url},
    )
    assert response.status_code == 400
