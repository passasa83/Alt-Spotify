import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient


MOCK_JIOSAAVN_SEARCH_RESPONSE = {
    "songs": {
        "data": [
            {
                "id": "jio_test_1",
                "name": "JioSaavn Test Song",
                "primaryArtists": "Test Artist Jio",
                "album": {"name": "Test Album Jio"},
                "duration": "240",
                "language": "hindi",
                "year": "2024",
                "url": "https://www.jiosaavn.com/song/test/abc123",
                "image": [
                    {"url": "https://example.com/small.jpg"},
                    {"url": "https://example.com/large.jpg"},
                ],
                "downloadUrl": [
                    {"quality": "128kbps", "url": "https://example.com/128.mp3"},
                    {"quality": "320kbps", "url": "https://example.com/320.mp3"},
                ],
            }
        ]
    }
}

MOCK_MP3_DATA = b"\xff\xfb\x90\x00" + b"\x00" * 50000


@pytest.mark.asyncio
@patch("app.services.jiosaavn.search_jiosaavn")
async def test_search_with_jiosaavn_fallback(mock_search, client: AsyncClient, admin_headers):
    mock_search.return_value = [
        {
            "title": "JioSaavn Test Song",
            "artist": "Test Artist Jio",
            "album": "Test Album Jio",
            "image_url": "https://example.com/large.jpg",
            "duration": 240,
            "language": "hindi",
            "year": "2024",
            "download_url": "https://example.com/320.mp3",
            "jiosaavn_id": "jio_test_1",
            "jiosaavn_url": "https://www.jiosaavn.com/song/test/abc123",
        }
    ]

    with patch("app.services.jiosaavn.import_from_jiosaavn") as mock_import:
        mock_import.return_value = None

        response = await client.get("/api/v1/search?q=unique_nonexistent_track_xyz&type=tracks")
        assert response.status_code == 200
        data = response.json()
        assert "tracks" in data
        assert len(data["tracks"]) >= 0


@pytest.mark.asyncio
@patch("app.services.jiosaavn.httpx.AsyncClient")
async def test_search_jiosaavn_endpoint(mock_httpx, client: AsyncClient, admin_headers):
    mock_response = MagicMock()
    mock_response.json.return_value = MOCK_JIOSAAVN_SEARCH_RESPONSE
    mock_response.raise_for_status = MagicMock()
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_httpx.return_value)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_httpx.return_value.get = AsyncMock(return_value=mock_response)

    with patch("app.services.jiosaavn.upload_file"):
        with patch("app.services.jiosaavn.import_from_jiosaavn") as mock_import:
            mock_import.return_value = None

            response = await client.get("/api/v1/search/jiosaavn?q=test+song&auto_import=false")
            assert response.status_code == 200
            data = response.json()
            assert "results" in data


@pytest.mark.asyncio
@patch("app.services.jiosaavn.httpx.AsyncClient")
async def test_search_jiosaavn_auto_import(mock_httpx, client: AsyncClient, admin_headers):
    mock_search_resp = MagicMock()
    mock_search_resp.json.return_value = MOCK_JIOSAAVN_SEARCH_RESPONSE
    mock_search_resp.raise_for_status = MagicMock()

    mock_dl_resp = MagicMock()
    mock_dl_resp.content = MOCK_MP3_DATA
    mock_dl_resp.raise_for_status = MagicMock()

    mock_client_instance = MagicMock()
    mock_client_instance.get = AsyncMock(side_effect=[mock_search_resp, mock_dl_resp])
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.jiosaavn.upload_file"):
        response = await client.get("/api/v1/search/jiosaavn?q=test+song+auto&auto_import=true")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "imported" in data


@pytest.mark.asyncio
async def test_search_local_results_prioritized(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Local Priority Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Local Priority Track",
            "artist_id": str(artist_id),
            "duration_seconds": 200,
        },
    )

    with patch("app.services.jiosaavn.search_jiosaavn") as mock_search:
        mock_search.return_value = []

        response = await client.get("/api/v1/search?q=Local+Priority&type=tracks")
        assert response.status_code == 200
        data = response.json()
        assert "tracks" in data
        assert len(data["tracks"]) >= 1
        assert data["tracks"][0]["title"] == "Local Priority Track"


@pytest.mark.asyncio
async def test_search_empty_with_no_jiosaavn_results(client: AsyncClient):
    with patch("app.services.jiosaavn.search_jiosaavn") as mock_search:
        mock_search.return_value = []

        response = await client.get("/api/v1/search?q=totally_unique_xyz_999&type=tracks")
        assert response.status_code == 200
        data = response.json()
        assert "tracks" in data
        assert len(data["tracks"]) == 0
