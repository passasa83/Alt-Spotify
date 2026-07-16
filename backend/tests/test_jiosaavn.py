import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient


MOCK_MUSICBRAINZ_RESPONSE = {
    "recordings": [
        {
            "id": "mb_test_123",
            "title": "Bohemian Rhapsody",
            "artist-credit": [{"name": "Queen"}],
            "releases": [{"title": "A Night at the Opera"}],
            "length": 354000,
            "isrcs": ["GBUM71029604"],
            "disambiguation": "",
        }
    ]
}

MOCK_JIOSAAVN_SEARCH_RESPONSE = {
    "songs": {
        "data": [
            {
                "id": "jio_test_1",
                "name": "Bohemian Rhapsody",
                "primaryArtists": "Queen",
                "album": {"name": "A Night at the Opera"},
                "duration": "354",
                "language": "english",
                "year": "1975",
                "url": "https://www.jiosaavn.com/song/bohemian-rhapsody/abc123",
                "image": [{"url": "https://example.com/small.jpg"}, {"url": "https://example.com/large.jpg"}],
                "downloadUrl": [{"quality": "320kbps", "url": "https://example.com/320.mp3"}],
            }
        ]
    }
}

MOCK_MP3_DATA = b"\xff\xfb\x90\x00" + b"\x00" * 50000


@pytest.mark.asyncio
@patch("app.services.musicbrainz.httpx.AsyncClient")
async def test_musicbrainz_search_recordings(mock_httpx):
    mock_response = MagicMock()
    mock_response.json.return_value = MOCK_MUSICBRAINZ_RESPONSE
    mock_response.raise_for_status = MagicMock()
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_httpx.return_value)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_httpx.return_value.get = AsyncMock(return_value=mock_response)

    from app.services.musicbrainz import search_recordings
    results = await search_recordings("Bohemian Rhapsody")

    assert len(results) == 1
    assert results[0]["title"] == "Bohemian Rhapsody"
    assert results[0]["artist"] == "Queen"
    assert results[0]["album"] == "A Night at the Opera"
    assert results[0]["duration"] == 354
    assert results[0]["isrc"] == "GBUM71029604"


@pytest.mark.asyncio
@patch("app.services.musicbrainz.httpx.AsyncClient")
async def test_musicbrainz_search_artists(mock_httpx):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "artists": [
            {
                "name": "Queen",
                "disambiguation": "British rock band",
                "country": "GB",
                "id": "mb_artist_123",
                "type": "Group",
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_httpx.return_value)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_httpx.return_value.get = AsyncMock(return_value=mock_response)

    from app.services.musicbrainz import search_artists
    results = await search_artists("Queen")

    assert len(results) == 1
    assert results[0]["name"] == "Queen"
    assert results[0]["country"] == "GB"


@pytest.mark.asyncio
@patch("app.services.musicbrainz.httpx.AsyncClient")
async def test_enriched_search_musicbrainz_plus_jiosaavn(mock_httpx, client: AsyncClient, admin_headers):
    mock_mb_resp = MagicMock()
    mock_mb_resp.json.return_value = MOCK_MUSICBRAINZ_RESPONSE
    mock_mb_resp.raise_for_status = MagicMock()

    mock_jio_resp = MagicMock()
    mock_jio_resp.json.return_value = MOCK_JIOSAAVN_SEARCH_RESPONSE
    mock_jio_resp.raise_for_status = MagicMock()

    mock_dl_resp = MagicMock()
    mock_dl_resp.content = MOCK_MP3_DATA
    mock_dl_resp.raise_for_status = MagicMock()

    mock_client_instance = MagicMock()
    mock_client_instance.get = AsyncMock(side_effect=[mock_mb_resp, mock_jio_resp, mock_dl_resp])
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.jiosaavn.upload_file"):
        response = await client.get(
            "/api/v1/search/enriched?q=Bohemian+Rhapsody&auto_import=true"
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["count"] >= 1
        assert data["results"][0]["title"] == "Bohemian Rhapsody"
        assert data["results"][0]["artist"] == "Queen"


@pytest.mark.asyncio
@patch("app.services.musicbrainz.httpx.AsyncClient")
async def test_enriched_search_no_download_url(mock_httpx, client: AsyncClient, admin_headers):
    mock_mb_resp = MagicMock()
    mock_mb_resp.json.return_value = MOCK_MUSICBRAINZ_RESPONSE
    mock_mb_resp.raise_for_status = MagicMock()

    mock_jio_resp = MagicMock()
    mock_jio_resp.json.return_value = {"songs": {"data": []}}
    mock_jio_resp.raise_for_status = MagicMock()

    mock_client_instance = MagicMock()
    mock_client_instance.get = AsyncMock(side_effect=[mock_mb_resp, mock_jio_resp])
    mock_httpx.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_httpx.return_value.__aexit__ = AsyncMock(return_value=False)

    response = await client.get(
        "/api/v1/search/enriched?q=Bohemian+Rhapsody&auto_import=true"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["results"][0]["download_url"] is None
    assert data["results"][0]["imported"] is False


@pytest.mark.asyncio
@patch("app.api.v1.search.search_jiosaavn")
async def test_search_local_results_prioritized(mock_search, client: AsyncClient, admin_headers):
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

    mock_search.return_value = []

    response = await client.get("/api/v1/search?q=Local+Priority&type=tracks")
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    assert len(data["tracks"]) >= 1
    assert data["tracks"][0]["title"] == "Local Priority Track"
