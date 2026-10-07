"""Albums of downloaded tracks: from the file's tag, else looked up on Deezer."""
import urllib.parse
import uuid
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track
from app.services import album_lookup, cover_service
from app.services.album_lookup import fetch_track_album


async def test_fetch_track_album_asks_deezer_in_plain_words():
    cover_service._cover_cache.clear()
    answer = {
        "data": [
            {"title": "Someone Like You", "artist": {"name": "Adele"}, "album": {"title": "21", "cover_medium": "http://img"}},
        ]
    }
    request = AsyncMock(return_value=answer)
    with patch.object(album_lookup, "_throttled_request", request):
        assert await fetch_track_album("Adele", "Someone Like You") == {"title": "21", "cover": "http://img"}
        # Deezer answers nothing to artist:"…" field syntax, so words only.
        # Second time: from the cache, which keeps the album name alone.
        assert await fetch_track_album("Adele", "Someone Like You") == {"title": "21", "cover": None}
    assert request.await_count == 1
    query = urllib.parse.unquote_plus(urllib.parse.urlparse(request.await_args.args[0]).query)
    assert "Adele Someone Like You" in query and "artist:" not in query


async def test_fetch_track_album_drops_a_hit_by_someone_else():
    cover_service._cover_cache.clear()
    answer = {"data": [{"title": "Someone Like You", "artist": {"name": "Other Band"}, "album": {"title": "21"}}]}
    with patch.object(album_lookup, "_throttled_request", AsyncMock(return_value=answer)):
        assert await fetch_track_album("Adele", "Someone Like You") is None


async def _seed(db_session):
    band = Artist(id=uuid.uuid4(), name="Band")
    existing = Album(id=uuid.uuid4(), title="Greatest Hits", artist_id=band.id)
    db_session.add_all([
        band,
        existing,
        Track(
            title="Kept",
            artist_id=band.id,
            duration_seconds=200,
            file_url="audio/kept.mp3",
            album_id=existing.id,
        ),
        Track(title="Song 15", artist_id=band.id, duration_seconds=200, file_url="audio/a.mp3"),
        Track(title="Other", artist_id=band.id, duration_seconds=200, file_url="audio/b.mp3"),
    ])
    await db_session.flush()
    return band


async def test_fill_albums_links_only_the_tracks_without_one(client: AsyncClient, db_session, admin_headers, auth_headers):
    band = await _seed(db_session)

    preview = (await client.post("/api/v1/fill-albums", headers=admin_headers)).json()
    assert preview["tracks"] == 2 and preview["artists"] == 1

    # Both tracks land on the album that already exists: no duplicate album.
    lookup = AsyncMock(return_value={"title": "Greatest Hits", "cover": None})
    with patch.object(album_lookup, "fetch_track_album", lookup):
        assert (await client.post("/api/v1/fill-albums?dry_run=false", headers=admin_headers)).status_code == 200
    assert lookup.await_count == 2

    albums = (await client.get(f"/api/v1/artists/{band.id}/albums", headers=auth_headers)).json()
    assert albums["total"] == 1
    tracks = (await client.get("/api/v1/tracks", params={"artistId": str(band.id)}, headers=auth_headers)).json()
    assert all(t["album_id"] for t in tracks["items"])
    assert (await client.post("/api/v1/fill-albums", headers=admin_headers)).json()["tracks"] == 0


async def test_fill_albums_keeps_the_tracks_no_lookup_finds(client: AsyncClient, db_session, admin_headers):
    await _seed(db_session)
    with patch.object(album_lookup, "fetch_track_album", AsyncMock(return_value=None)):
        assert (await client.post("/api/v1/fill-albums?dry_run=false", headers=admin_headers)).status_code == 200
    assert (await client.post("/api/v1/fill-albums", headers=admin_headers)).json()["tracks"] == 2


async def test_fill_albums_requires_admin(client: AsyncClient, auth_headers):
    assert (await client.post("/api/v1/fill-albums", headers=auth_headers)).status_code == 403


async def test_fetch_url_puts_the_new_track_on_its_album(client: AsyncClient, db_session, auth_headers):
    cover_service._cover_cache.clear()
    download = AsyncMock(
        return_value={
            "success": True,
            "file_url": "local:/app/downloads/Band - Song 15.m4a",
            "youtube_url": "https://youtu.be/x",
            "youtube_title": "Song 15",
            "youtube_duration": 200,
            "metadata": {"album": "Greatest Hits"},
        }
    )
    lookup = AsyncMock(return_value=None)
    with patch("app.services.yt_dlp_download.download_from_url", download), patch.object(
        album_lookup, "fetch_track_album", lookup
    ):
        response = await client.post(
            "/api/v1/tracks/fetch-url",
            headers=auth_headers,
            params={"youtube_url": "https://youtu.be/x", "title": "Song 15", "artist": "Band"},
        )
    assert response.status_code == 200
    body = response.json()
    # The file's own album is enough: no need to ask Deezer.
    assert body["album_id"]
    assert lookup.await_count == 0
    album = (await client.get(f"/api/v1/albums/{body['album_id']}", headers=auth_headers)).json()
    assert album["title"] == "Greatest Hits"


async def test_fetch_youtube_looks_the_album_up_when_the_file_has_no_tag(
    client: AsyncClient, db_session, auth_headers
):
    cover_service._cover_cache.clear()
    band = Artist(id=uuid.uuid4(), name="Band")
    db_session.add(band)
    await db_session.flush()
    track = Track(
        title="Song 15",
        artist_id=band.id,
        duration_seconds=0,
        cover_url="http://img/cover.jpg",
    )
    db_session.add(track)
    await db_session.flush()

    download = AsyncMock(
        return_value={
            "success": True,
            "file_url": "local:/app/downloads/song.m4a",
            "youtube_url": "https://youtu.be/x",
            "youtube_title": "Song 15",
            "youtube_duration": 200,
            "metadata": {},
        }
    )
    with patch("app.services.yt_dlp_download.search_and_download", download), patch.object(
        album_lookup, "fetch_track_album", AsyncMock(return_value={"title": "B-Sides", "cover": None})
    ):
        response = await client.post(f"/api/v1/tracks/{track.id}/fetch-youtube", headers=auth_headers)

    assert response.status_code == 200
    album_id = response.json()["album_id"]
    assert album_id
    album = (await client.get(f"/api/v1/albums/{album_id}", headers=auth_headers)).json()
    assert album["title"] == "B-Sides"
    assert uuid.UUID(album["artist_id"]) == band.id
