import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.models.track import Track
from app.models.artist import Artist


async def _create_artist(db_session):
    artist = Artist(id=uuid.uuid4(), name="Stream Artist", image_url=None)
    db_session.add(artist)
    await db_session.flush()
    return artist


async def _create_track(db_session, artist_id, hls_path=None, file_url=None):
    track = Track(
        id=uuid.uuid4(),
        title="Stream Track",
        artist_id=artist_id,
        duration_seconds=200,
        is_explicit=False,
        play_count=0,
        hls_path=hls_path,
        file_url=file_url,
    )
    db_session.add(track)
    await db_session.flush()
    return track


async def test_master_playlist(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.read.return_value = b"#EXTM3U\n#EXT-X-STREAM-INF"
        mock_response.close.return_value = None
        mock_response.release_conn.return_value = None
        mock_client.get_object.return_value = mock_response
        mock_minio.return_value = mock_client
        response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8", headers=auth_headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.apple.mpegurl"


async def test_master_playlist_not_found(client: AsyncClient, auth_headers):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/master.m3u8", headers=auth_headers)
    assert response.status_code == 404


async def test_master_playlist_no_hls(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path=None)
    response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] is not None


async def test_variant_playlist(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.read.return_value = b"#EXTM3U\n#EXT-X-TARGETDURATION:10"
        mock_response.close.return_value = None
        mock_response.release_conn.return_value = None
        mock_client.get_object.return_value = mock_response
        mock_minio.return_value = mock_client
        response = await client.get(f"/api/v1/stream/{track.id}/128k/playlist.m3u8", headers=auth_headers)
        assert response.status_code == 200


async def test_variant_playlist_invalid_quality(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test")
    response = await client.get(f"/api/v1/stream/{track.id}/64k/playlist.m3u8", headers=auth_headers)
    assert response.status_code == 400
    assert "Invalid quality" in response.json()["detail"]


async def test_hls_segment(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.read.return_value = b"\x47\x00\x00\x00"
        mock_response.close.return_value = None
        mock_response.release_conn.return_value = None
        mock_client.get_object.return_value = mock_response
        mock_minio.return_value = mock_client
        response = await client.get(f"/api/v1/stream/{track.id}/128k/segment_001.ts", headers=auth_headers)
        assert response.status_code == 200


async def test_hls_segment_invalid_extension(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test")
    response = await client.get(f"/api/v1/stream/{track.id}/128k/segment001.mp3", headers=auth_headers)
    assert response.status_code == 400
    assert "Invalid segment" in response.json()["detail"]


async def test_download_track(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, file_url="files/track.mp3")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        stat = MagicMock()
        stat.size = len(b"fake-audio-content")
        stat.content_type = "audio/mpeg"
        mock_client.stat_object.return_value = stat
        mock_response = MagicMock()
        mock_response.read.return_value = b"fake-audio-content"
        mock_response.close.return_value = None
        mock_response.release_conn.return_value = None
        mock_client.get_object.return_value = mock_response
        mock_minio.return_value = mock_client
        response = await client.get(f"/api/v1/stream/{track.id}/download", headers=auth_headers)
        assert response.status_code == 200
        assert "attachment" in response.headers.get("content-disposition", "")
        assert response.content == b"fake-audio-content"


async def test_download_track_not_found(client: AsyncClient, auth_headers):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/download", headers=auth_headers)
    assert response.status_code == 404


async def test_download_track_no_file(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, file_url=None)
    response = await client.get(f"/api/v1/stream/{track.id}/download", headers=auth_headers)
    assert response.status_code == 404
    assert "file not available" in response.json()["detail"].lower()


async def test_variant_playlist_not_found(client: AsyncClient, auth_headers):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/128k/playlist.m3u8", headers=auth_headers)
    assert response.status_code == 404


async def test_hls_segment_not_found(client: AsyncClient, auth_headers):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/128k/segment_001.ts", headers=auth_headers)
    assert response.status_code == 404


async def test_hls_requires_auth(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    for path in ("master.m3u8", "128k/playlist.m3u8", "128k/segment_001.ts"):
        response = await client.get(f"/api/v1/stream/{track.id}/{path}")
        assert response.status_code == 401


async def test_hls_accepts_query_token(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_response = MagicMock()
        mock_response.read.return_value = b"#EXTM3U"
        mock_minio.return_value.get_object.return_value = mock_response
        response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8?token={token}")
    assert response.status_code == 200


async def test_hls_segment_rejects_unexpected_names(client: AsyncClient, db_session, auth_headers):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test")
    for segment in ("other.ts", "segment_1.ts", "segment_001.ts.bak"):
        response = await client.get(f"/api/v1/stream/{track.id}/128k/{segment}", headers=auth_headers)
        assert response.status_code == 400


async def test_hls_explicit_track_blocked_for_child(client: AsyncClient, db_session, test_user, auth_headers):
    test_user.is_child_account = True
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    track.is_explicit = True
    await db_session.flush()
    response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8", headers=auth_headers)
    assert response.status_code == 403


async def test_download_requires_auth(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, file_url="files/track.mp3")
    response = await client.get(f"/api/v1/stream/{track.id}/download")
    assert response.status_code == 401


async def test_hls_playlists_pass_the_query_token_on(client: AsyncClient, db_session, auth_headers):
    # Native players (iOS/Android/Safari) fetch variants and segments without
    # our header: the token must travel inside the playlists.
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test-track")
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    master = b"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=140800\n128k/playlist.m3u8\n"
    variant = b"#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n#EXT-X-ENDLIST\n"
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_response = MagicMock()
        mock_minio.return_value.get_object.return_value = mock_response

        mock_response.read.return_value = master
        body = (await client.get(f"/api/v1/stream/{track.id}/master.m3u8?token={token}")).text
        assert f"128k/playlist.m3u8?token={token}" in body
        assert "#EXT-X-STREAM-INF:BANDWIDTH=140800\n" in body

        mock_response.read.return_value = variant
        body = (await client.get(f"/api/v1/stream/{track.id}/128k/playlist.m3u8?token={token}")).text
        assert f"segment_000.ts?token={token}" in body
        assert "#EXT-X-ENDLIST" in body

        # Header-authenticated clients (HLS.js) get the playlist untouched.
        body = (await client.get(f"/api/v1/stream/{track.id}/128k/playlist.m3u8", headers=auth_headers)).text
        assert "token=" not in body
