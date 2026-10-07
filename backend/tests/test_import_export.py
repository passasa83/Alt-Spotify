import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

import app.api.v1.import_export as import_export
from app.models.artist import Artist
from app.models.track import Track
from app.services import artist_import
from app.services.deezer import extract_playlist_id


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.deezer.com/playlist/42", "42"),
        # Copied from the website: language segment in the path.
        ("https://www.deezer.com/fr/playlist/1313621735", "1313621735"),
        ("https://www.deezer.com/en-gb/playlist/7", "7"),
        ("123", "123"),
        ("https://www.deezer.com/fr/album/9", None),
        ("https://example.com/playlist/1", None),
    ],
)
def test_extract_deezer_playlist_id(url, expected):
    assert extract_playlist_id(url) == expected


async def test_deezer_import_queues_missing_tracks_for_download(
    client: AsyncClient, auth_headers, fake_redis, db_session
):
    """The import matches what is already local and downloads the rest."""
    artist = Artist(name="Local Artist")
    db_session.add(artist)
    await db_session.flush()
    db_session.add(
        Track(
            title="Local Song",
            artist_id=artist.id,
            duration_seconds=200,
            file_url="local:/music/local.flac",
        )
    )
    await db_session.flush()

    playlist_data = {
        "title": "Deezer Mix",
        "description": "",
        "track_count": 3,
        "tracks": [
            # No album: the matcher filters on album only when one is given.
            {"title": "Local Song", "artist": "Local Artist", "album": "", "duration": 200},
            {"title": "Missing Song", "artist": "Missing Artist", "album": "Album", "duration": 180},
            {"title": "", "artist": "", "album": "", "duration": 0},
        ],
    }
    with patch.object(import_export, "fetch_deezer_playlist", AsyncMock(return_value=playlist_data)):
        resp = await client.post(
            "/api/v1/playlists/import-export/deezer",
            json={"url": "https://www.deezer.com/playlist/42"},
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["matched"] == 1
    assert data["queued_for_download"] == 1

    # The missing track was queued for the background download worker...
    assert await fake_redis.llen(artist_import.TRACK_QUEUE) == 1
    job = json.loads(await fake_redis.lpop(artist_import.TRACK_QUEUE))
    assert job["deezer_id"] == f"playlist:{data['playlist_id']}"

    # ...and added to the playlist alongside the local match (the empty
    # row is skipped, not stubbed).
    playlist_tracks = (
        await client.get(f"/api/v1/playlists/{data['playlist_id']}/tracks", headers=auth_headers)
    ).json()
    assert len(playlist_tracks) == 2


async def test_deezer_import_still_works_without_redis(client: AsyncClient, auth_headers, db_session):
    """Redis down: the import succeeds, nothing is queued."""
    import app.core.redis as app_redis

    playlist_data = {
        "title": "Deezer Mix",
        "description": "",
        "track_count": 1,
        "tracks": [{"title": "Missing Song", "artist": "Missing Artist", "album": "Album", "duration": 180}],
    }
    with (
        patch.object(import_export, "fetch_deezer_playlist", AsyncMock(return_value=playlist_data)),
        patch.object(app_redis, "get_redis", AsyncMock(side_effect=ConnectionError("redis down"))),
    ):
        resp = await client.post(
            "/api/v1/playlists/import-export/deezer",
            json={"url": "https://www.deezer.com/playlist/42"},
            headers=auth_headers,
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["queued_for_download"] == 0
