"""Searching an artist downloads their whole discography in the background."""
import json
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track
from app.services import artist_import

GIMS = {"id": 123, "name": "GIMS", "picture": "https://img/gims.jpg"}


def _album(album_id, title, record_type, release="2015-01-01"):
    return {"id": album_id, "title": title, "record_type": record_type, "release_date": release}


def _song(title, artist_id=123, duration=200):
    return {"title": title, "title_short": title, "duration": duration, "artist": {"id": artist_id}, "isrc": f"ISRC-{title}"}


DEEZER = {
    "/artist/123/albums": {"data": [
        _album(2, "Bella (single)", "single", "2014-01-01"),
        _album(1, "Mon cœur avait raison", "album"),
        _album(3, "Best of rap", "compile"),
    ]},
    "/album/1": {"title": "Mon cœur avait raison", "release_date": "2015-01-01", "cover_xl": "https://img/mcar.jpg",
                 "genres": {"data": [{"name": "Rap/Hip Hop"}]},
                 "tracks": {"data": [_song("Bella"), _song("Est-ce que tu m'aimes ?"), _song("Feat", artist_id=999)]}},
    "/album/2": {"title": "Bella", "release_date": "2014-01-01", "cover_xl": "https://img/bella.jpg",
                 "genres": {"data": []}, "tracks": {"data": [_song("Bella (Official Video)")]}},
    "/album/3": {"title": "Best of rap", "tracks": {"data": [_song("Compilation song")]}},
}


async def fake_deezer(client, path, **params):
    return DEEZER.get(path)


async def test_discography_without_compilations_or_repeats():
    with patch.object(artist_import, "_deezer", side_effect=fake_deezer):
        songs = await artist_import.fetch_discography(123)
    # The album comes first; the single's "Bella" is the same song; the
    # compilation and the other artist's track are left out.
    assert [s["title"] for s in songs] == ["Bella", "Est-ce que tu m'aimes ?"]
    assert songs[0]["album"] == "Mon cœur avait raison" and songs[0]["album_type"] == "album"


async def test_search_queues_the_artist_once(client: AsyncClient, auth_headers, fake_redis):
    with patch.object(artist_import, "match_artist", AsyncMock(return_value=GIMS)):
        first = (await client.get("/api/v1/search?q=gims&type=artists", headers=auth_headers)).json()
        second = (await client.get("/api/v1/search?q=GIMS&type=artists", headers=auth_headers)).json()
    assert first["artist_import"]["artist"] == "GIMS"
    assert first["artist_import"]["state"] == "preparing"
    assert second["artist_import"]["deezer_id"] == 123
    # Queued a single time, whatever the number of searches.
    assert await fake_redis.llen(artist_import.ARTIST_QUEUE) == 1

    progress = (await client.get("/api/v1/search/artist-import/123", headers=auth_headers)).json()
    assert progress["artist"] == "GIMS"


async def test_no_import_when_the_query_is_not_an_artist(client: AsyncClient, auth_headers, fake_redis):
    data = (await client.get("/api/v1/search?q=gim&type=artists", headers=auth_headers)).json()
    assert "artist_import" not in data
    assert await fake_redis.llen(artist_import.ARTIST_QUEUE) == 0


async def test_users_have_a_daily_quota(client: AsyncClient, auth_headers, fake_redis):
    for n in range(artist_import.DAILY_ARTISTS_PER_USER):
        artist = {"id": 1000 + n, "name": f"Artist {n}", "picture": None}
        with patch.object(artist_import, "match_artist", AsyncMock(return_value=artist)):
            data = (await client.get(f"/api/v1/search?q=Artist+{n}&type=artists", headers=auth_headers)).json()
        assert data["artist_import"]["state"] == "preparing"
    with patch.object(artist_import, "match_artist", AsyncMock(return_value={"id": 2000, "name": "One more", "picture": None})):
        data = (await client.get("/api/v1/search?q=One+more&type=artists", headers=auth_headers)).json()
    assert data["artist_import"]["state"] == "quota"


async def test_worker_creates_and_downloads_the_tracks(db_session, fake_redis):
    @asynccontextmanager
    async def session_factory():
        yield db_session

    # Already in the library: not created again.
    existing = Artist(id=uuid.uuid4(), name="GIMS")
    db_session.add(existing)
    await db_session.flush()
    db_session.add(Track(title="Bella", artist_id=existing.id, duration_seconds=200, file_url="local:/music/bella.flac"))
    # Left without audio by an earlier search: downloaded too, not duplicated.
    stub = Track(title="Est-ce que tu m'aimes ?", artist_id=existing.id, duration_seconds=0)
    db_session.add(stub)
    await db_session.flush()
    stub_id = stub.id

    await artist_import._set_status(123, {"artist": "GIMS", "state": "preparing", "total": 0, "done": 0, "failed": 0})
    with patch.object(artist_import, "_deezer", side_effect=fake_deezer):
        await artist_import._expand_artist(session_factory, GIMS)

    status = await artist_import.get_status(123)
    assert status["state"] == "downloading" and status["total"] == 1 and status["already"] == 1
    job = json.loads(await fake_redis.lpop(artist_import.TRACK_QUEUE))

    download = AsyncMock(return_value={"success": True, "file_url": "local:/app/downloads/GIMS - Est-ce que tu m'aimes.flac"})
    transcode = AsyncMock(return_value="task")
    with patch("app.services.yt_dlp_download.search_and_download", download), patch("app.core.tasks.enqueue_transcode", transcode):
        assert await artist_import.download_one(session_factory, job["track_id"]) is True
    await artist_import._bump(123, "done")

    track = (await db_session.execute(select(Track).where(Track.title == "Est-ce que tu m'aimes ?"))).scalar_one()
    assert uuid.UUID(str(track.id)) == uuid.UUID(str(stub_id))
    assert track.duration_seconds == 200
    assert track.file_url.endswith(".flac")
    assert track.genre == "Hip-Hop"
    assert track.cover_url == "https://img/mcar.jpg"
    album = (await db_session.execute(select(Album).where(Album.id == track.album_id))).scalar_one()
    assert album.title == "Mon cœur avait raison"
    transcode.assert_awaited_once()
    assert (await artist_import.get_status(123))["state"] == "finished"
