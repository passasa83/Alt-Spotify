import io
import uuid

import pytest
from httpx import AsyncClient

from app.core.tasks import TRANSCODE_TASK, celery_client
from app.models.artist import Artist
from app.models.track import Track


async def test_upload_audio_admin(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Upload Artist"},
    )
    artist_id = artist_resp.json()["id"]

    audio_content = b"\xff\xfb\x90\x00" * 1000
    response = await client.post(
        "/api/v1/upload/audio",
        headers=admin_headers,
        files={"file": ("test.mp3", io.BytesIO(audio_content), "audio/mpeg")},
        data={"title": "Uploaded Track", "artist_id": artist_id},
    )
    assert response.status_code == 202
    data = response.json()
    assert "track_id" in data
    assert data["status"] in {"processing", "ready"}


async def test_upload_audio_creates_artist_and_album(client: AsyncClient, admin_headers):
    audio_content = b"\xff\xfb\x90\x00" * 1000
    response = await client.post(
        "/api/v1/upload/audio",
        headers=admin_headers,
        files={"file": ("test.mp3", io.BytesIO(audio_content), "audio/mpeg")},
        data={"title": "From Form", "artist": "Form Artist", "album": "Form Album", "genre": "jazz"},
    )
    assert response.status_code == 202

    track_id = response.json()["track_id"]
    track_resp = await client.get(f"/api/v1/tracks/{track_id}", headers=admin_headers)
    assert track_resp.status_code == 200
    track = track_resp.json()
    assert track["title"] == "From Form"
    assert track["genre"] == "jazz"
    assert track["album_id"] is not None

    album_resp = await client.get(f"/api/v1/albums/{track['album_id']}", headers=admin_headers)
    assert album_resp.status_code == 200
    assert album_resp.json()["title"] == "Form Album"


async def test_upload_audio_non_admin(client: AsyncClient, auth_headers):
    audio_content = b"\xff\xfb\x90\x00" * 1000
    response = await client.post(
        "/api/v1/upload/audio",
        headers=auth_headers,
        files={"file": ("test.mp3", io.BytesIO(audio_content), "audio/mpeg")},
        data={"title": "Uploaded Track"},
    )
    assert response.status_code == 403


async def test_upload_audio_invalid_type(client: AsyncClient, admin_headers):
    response = await client.post(
        "/api/v1/upload/audio",
        headers=admin_headers,
        files={"file": ("test.exe", io.BytesIO(b"not audio"), "application/octet-stream")},
        data={"title": "Bad Upload"},
    )
    assert response.status_code == 400


async def test_upload_cover(client: AsyncClient, admin_headers):
    image_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    response = await client.post(
        "/api/v1/upload/cover",
        headers=admin_headers,
        files={"file": ("cover.png", io.BytesIO(image_content), "image/png")},
        data={"entity_type": "track"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "url" in data
    assert data["entity_type"] == "track"


async def test_upload_cover_invalid_type(client: AsyncClient, admin_headers):
    response = await client.post(
        "/api/v1/upload/cover",
        headers=admin_headers,
        files={"file": ("bad.txt", io.BytesIO(b"text"), "text/plain")},
        data={"entity_type": "track"},
    )
    assert response.status_code == 400


async def test_upload_audio_queues_transcode(client: AsyncClient, admin_headers):
    response = await client.post(
        "/api/v1/upload/audio",
        headers=admin_headers,
        files={"file": ("song.flac", io.BytesIO(b"fLaC" * 100), "audio/flac")},
        data={"title": "HLS Track", "artist": "HLS Artist"},
    )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "processing"
    assert data["task_id"] == "test-task-id"

    # SQLite stores UUIDs as hex, so compare parsed UUIDs rather than strings.
    track_id = uuid.UUID(data["track_id"])
    celery_client.send_task.assert_called_once()
    (task_name,), kwargs = celery_client.send_task.call_args
    source, prefix, task_track_id = kwargs["args"]
    assert task_name == TRANSCODE_TASK
    assert source == f"audio/{track_id}.flac"
    assert prefix == f"hls/{track_id}"
    assert uuid.UUID(task_track_id) == track_id


async def test_upload_audio_broker_down_still_ready(client: AsyncClient, admin_headers):
    celery_client.send_task.side_effect = ConnectionError("redis down")
    response = await client.post(
        "/api/v1/upload/audio",
        headers=admin_headers,
        files={"file": ("song.mp3", io.BytesIO(b"ID3" * 100), "audio/mpeg")},
        data={"title": "No Queue", "artist": "Someone"},
    )
    assert response.status_code == 202
    assert response.json()["status"] == "ready"
    assert response.json()["task_id"] is None


async def _track(db_session, file_url="audio/x.mp3", hls_path=None):
    artist = Artist(id=uuid.uuid4(), name=f"Artist {uuid.uuid4().hex[:6]}")
    db_session.add(artist)
    await db_session.flush()
    track = Track(
        id=uuid.uuid4(), title="T", artist_id=artist.id, duration_seconds=10,
        file_url=file_url, hls_path=hls_path,
    )
    db_session.add(track)
    await db_session.flush()
    return track


async def test_retranscode_track(client: AsyncClient, db_session, admin_headers):
    track = await _track(db_session)
    response = await client.post(f"/api/v1/upload/transcode/{track.id}", headers=admin_headers)
    assert response.status_code == 202
    assert response.json()["task_id"] == "test-task-id"


async def test_retranscode_requires_admin(client: AsyncClient, db_session, auth_headers):
    track = await _track(db_session)
    response = await client.post(f"/api/v1/upload/transcode/{track.id}", headers=auth_headers)
    assert response.status_code == 403


async def test_retranscode_without_source(client: AsyncClient, db_session, admin_headers):
    track = await _track(db_session, file_url=None)
    response = await client.post(f"/api/v1/upload/transcode/{track.id}", headers=admin_headers)
    assert response.status_code == 400


async def test_transcode_missing_only_queues_tracks_without_hls(client: AsyncClient, db_session, admin_headers):
    await _track(db_session, file_url="audio/a.mp3")
    await _track(db_session, file_url="audio/b.mp3")
    await _track(db_session, file_url="audio/c.mp3", hls_path="hls/c")
    await _track(db_session, file_url=None)

    response = await client.post("/api/v1/upload/transcode-missing", headers=admin_headers)
    assert response.status_code == 202
    assert response.json() == {"queued": 2}
    assert celery_client.send_task.call_count == 2


async def test_upload_audio_storage_down_answers_503(client: AsyncClient, admin_headers, auth_headers):
    from unittest.mock import patch

    with patch("app.core.minio.get_minio_client", side_effect=ConnectionError("minio down")):
        response = await client.post(
            "/api/v1/upload/audio",
            headers=admin_headers,
            files={"file": ("song.mp3", io.BytesIO(b"ID3" * 100), "audio/mpeg")},
            data={"title": "Lost", "artist": "Nobody"},
        )
    assert response.status_code == 503
    assert "Storage" in response.json()["detail"]
    # Nothing half-created when the file could not be stored.
    titles = [t["title"] for t in (await client.get("/api/v1/tracks", headers=auth_headers)).json()["items"]]
    assert "Lost" not in titles


async def test_upload_cover_storage_down_answers_503(client: AsyncClient, admin_headers):
    from unittest.mock import patch

    with patch("app.core.minio.get_minio_client", side_effect=ConnectionError("minio down")):
        response = await client.post(
            "/api/v1/upload/cover",
            headers=admin_headers,
            files={"file": ("c.png", io.BytesIO(b"\x89PNG\r\n\x1a\n"), "image/png")},
        )
    assert response.status_code == 503


async def test_enqueue_skips_unreachable_broker(monkeypatch):
    from app.core import tasks

    monkeypatch.setattr(tasks, "_broker_reachable", lambda: False)
    assert await tasks.enqueue_transcode("x", "audio/x.mp3") is None


async def test_transcode_missing_skips_local_files_that_are_gone(client: AsyncClient, db_session, admin_headers, tmp_path):
    present = tmp_path / "here.flac"
    present.write_bytes(b"fLaC")
    await _track(db_session, file_url=f"local:{present}")
    await _track(db_session, file_url=f"local:{tmp_path / 'gone.flac'}")

    response = await client.post("/api/v1/upload/transcode-missing", headers=admin_headers)
    assert response.json() == {"queued": 1}
    assert celery_client.send_task.call_count == 1


async def test_scan_queues_hls_for_imported_tracks(client: AsyncClient, db_session, admin_headers, tmp_path, monkeypatch):
    import math
    import struct
    import wave

    from unittest.mock import patch

    folder = tmp_path / "Scan Artist" / "Scan Album"
    folder.mkdir(parents=True)
    for n in (1, 2):
        with wave.open(str(folder / f"0{n} - Scan Artist - Song {n}.wav"), "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(b"".join(struct.pack("<h", int(1000 * math.sin(i / 3))) for i in range(800)))
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(tmp_path))

    with patch("app.services.cover_service.fetch_cover", return_value=None), \
         patch("app.core.database.async_session"):
        response = await client.post("/api/v1/scan", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["imported"] == 2
    assert data["transcode_queued"] == 2
    assert celery_client.send_task.call_count == 2
