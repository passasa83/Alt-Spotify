"""Access rules of a private, invite-only platform."""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token, hash_password
from app.models.artist import Artist
from app.models.playlist import Playlist
from app.models.podcast import Episode, Podcast
from app.models.track import Track
from app.models.user import User, UserRole


async def _other_user_headers(db_session) -> dict:
    other = User(
        id=uuid.uuid4(),
        email="other@example.com",
        hashed_password=hash_password("OtherPass123!"),
        pseudo="other",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()
    return {"Authorization": f"Bearer {create_access_token(str(other.id))}"}


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/albums",
        "/api/v1/artists",
        "/api/v1/podcasts",
        f"/api/v1/lyrics/{uuid.uuid4()}",
        f"/api/v1/recommendations/similar/{uuid.uuid4()}",
        f"/api/v1/users/{uuid.uuid4()}",
        f"/api/v1/playlists/{uuid.uuid4()}",
        f"/api/v1/jam/{uuid.uuid4()}",
    ],
)
async def test_catalogue_requires_login(client: AsyncClient, path):
    response = await client.get(path)
    assert response.status_code == 401


async def test_private_playlist_hidden_from_other_users(client: AsyncClient, db_session, test_user, auth_headers):
    playlist = Playlist(title="Secret", owner_id=test_user.id, is_public=False)
    db_session.add(playlist)
    await db_session.flush()
    other_headers = await _other_user_headers(db_session)

    for suffix in ("", "/tracks", "/duplicates"):
        response = await client.get(f"/api/v1/playlists/{playlist.id}{suffix}", headers=other_headers)
        assert response.status_code == 404, suffix
        response = await client.get(f"/api/v1/playlists/{playlist.id}{suffix}", headers=auth_headers)
        assert response.status_code == 200, suffix


async def test_public_playlist_visible_to_other_users(client: AsyncClient, db_session, test_user):
    playlist = Playlist(title="Shared", owner_id=test_user.id, is_public=True)
    db_session.add(playlist)
    await db_session.flush()
    other_headers = await _other_user_headers(db_session)

    response = await client.get(f"/api/v1/playlists/{playlist.id}", headers=other_headers)
    assert response.status_code == 200


async def test_tracks_sorted_by_play_count(client: AsyncClient, db_session, auth_headers):
    artist = Artist(id=uuid.uuid4(), name="Sorter")
    db_session.add(artist)
    await db_session.flush()
    for title, plays in (("Low", 1), ("High", 50), ("Mid", 10)):
        db_session.add(Track(title=title, artist_id=artist.id, duration_seconds=100, play_count=plays))
    await db_session.flush()

    response = await client.get("/api/v1/tracks?sort=play_count&order=desc", headers=auth_headers)
    assert response.status_code == 200
    assert [t["title"] for t in response.json()["items"]] == ["High", "Mid", "Low"]

    response = await client.get("/api/v1/tracks?sort=title&order=asc", headers=auth_headers)
    assert [t["title"] for t in response.json()["items"]] == ["High", "Low", "Mid"]


async def test_tracks_rejects_unknown_sort(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/tracks?sort=hashed_password", headers=auth_headers)
    assert response.status_code == 422


async def _episode(db_session, audio_url: str) -> Episode:
    podcast = Podcast(title="Pod")
    db_session.add(podcast)
    await db_session.flush()
    episode = Episode(podcast_id=podcast.id, title="Ep", audio_url=audio_url)
    db_session.add(episode)
    await db_session.flush()
    return episode


async def test_rss_episode_stream_redirects_to_publisher(client: AsyncClient, db_session, auth_headers):
    episode = await _episode(db_session, "https://cdn.example.com/ep1.mp3")
    response = await client.get(
        f"/api/v1/podcasts/{episode.podcast_id}/episodes/{episode.id}/stream", headers=auth_headers
    )
    assert response.status_code == 307
    assert response.headers["location"] == "https://cdn.example.com/ep1.mp3"


async def test_uploaded_episode_stream_is_proxied(client: AsyncClient, db_session, auth_headers):
    episode = await _episode(db_session, "podcasts/ep1.mp3")
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        stat = MagicMock(size=4, content_type="audio/mpeg")
        mock_minio.return_value.stat_object.return_value = stat
        mock_minio.return_value.get_object.return_value.read.side_effect = [b"abcd", b""]
        response = await client.get(
            f"/api/v1/podcasts/{episode.podcast_id}/episodes/{episode.id}/stream?token={token}"
        )
    assert response.status_code == 200
    assert response.content == b"abcd"


async def test_episode_stream_requires_login(client: AsyncClient, db_session):
    episode = await _episode(db_session, "https://cdn.example.com/ep1.mp3")
    response = await client.get(f"/api/v1/podcasts/{episode.podcast_id}/episodes/{episode.id}/stream")
    assert response.status_code == 401


async def test_get_episode(client: AsyncClient, db_session, auth_headers):
    episode = await _episode(db_session, "https://cdn.example.com/ep1.mp3")
    response = await client.get(f"/api/v1/podcasts/episodes/{episode.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Ep"
    assert uuid.UUID(response.json()["podcast_id"]) == uuid.UUID(str(episode.podcast_id))

    missing = await client.get(f"/api/v1/podcasts/episodes/{uuid.uuid4()}", headers=auth_headers)
    assert missing.status_code == 404


@pytest.mark.parametrize("path", ["/api/v1/tidal/search?q=x", "/api/v1/tidal/tracks/1/stream"])
async def test_tidal_requires_login(client: AsyncClient, path):
    response = await client.get(path)
    assert response.status_code == 401


async def test_local_track_streams_with_range(client: AsyncClient, db_session, auth_headers, tmp_path, monkeypatch):
    # Local files are only served from the music folders.
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(tmp_path))
    audio = tmp_path / "song.mp3"
    audio.write_bytes(bytes(range(256)) * 4)  # 1024 bytes
    artist = Artist(id=uuid.uuid4(), name="Local")
    db_session.add(artist)
    await db_session.flush()
    track = Track(title="Local song", artist_id=artist.id, duration_seconds=1, file_url=f"local:{audio}")
    db_session.add(track)
    await db_session.flush()

    full = await client.get(f"/api/v1/tracks/{track.id}/stream", headers=auth_headers)
    assert full.status_code == 200
    assert full.headers["content-type"] == "audio/mpeg"
    assert len(full.content) == 1024

    part = await client.get(f"/api/v1/tracks/{track.id}/stream", headers={**auth_headers, "Range": "bytes=1000-"})
    assert part.status_code == 206
    assert part.headers["content-range"] == "bytes 1000-1023/1024"
    assert part.content == audio.read_bytes()[1000:]

    beyond = await client.get(f"/api/v1/tracks/{track.id}/stream", headers={**auth_headers, "Range": "bytes=5000-"})
    assert beyond.status_code == 416
