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


async def test_master_playlist(client: AsyncClient, db_session):
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
        response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.apple.mpegurl"


async def test_master_playlist_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/master.m3u8")
    assert response.status_code == 404


async def test_master_playlist_no_hls(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path=None)
    response = await client.get(f"/api/v1/stream/{track.id}/master.m3u8")
    assert response.status_code == 404
    assert response.json()["detail"] is not None


async def test_variant_playlist(client: AsyncClient, db_session):
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
        response = await client.get(
            f"/api/v1/stream/{track.id}/128k/playlist.m3u8"
        )
        assert response.status_code == 200


async def test_variant_playlist_invalid_quality(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test")
    response = await client.get(
        f"/api/v1/stream/{track.id}/64k/playlist.m3u8"
    )
    assert response.status_code == 400
    assert "Invalid quality" in response.json()["detail"]


async def test_hls_segment(client: AsyncClient, db_session):
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
        response = await client.get(
            f"/api/v1/stream/{track.id}/128k/segment001.ts"
        )
        assert response.status_code == 200


async def test_hls_segment_invalid_extension(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, hls_path="hls/test")
    response = await client.get(
        f"/api/v1/stream/{track.id}/128k/segment001.mp3"
    )
    assert response.status_code == 400
    assert "Invalid segment" in response.json()["detail"]


async def test_download_track(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, file_url="files/track.mp3")
    with patch("app.api.v1.stream.get_minio_client") as mock_minio:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.read.return_value = b"fake-audio-content"
        mock_response.close.return_value = None
        mock_response.release_conn.return_value = None
        mock_client.get_object.return_value = mock_response
        mock_minio.return_value = mock_client
        response = await client.get(f"/api/v1/stream/{track.id}/download")
        assert response.status_code == 200
        assert "attachment" in response.headers.get("content-disposition", "")


async def test_download_track_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/download")
    assert response.status_code == 404


async def test_download_track_no_file(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, file_url=None)
    response = await client.get(f"/api/v1/stream/{track.id}/download")
    assert response.status_code == 404
    assert "file not available" in response.json()["detail"].lower()


async def test_variant_playlist_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/128k/playlist.m3u8")
    assert response.status_code == 404


async def test_hls_segment_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/stream/{fake_id}/128k/segment001.ts")
    assert response.status_code == 404
