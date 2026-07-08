import io

import pytest
from httpx import AsyncClient


async def test_upload_audio_admin(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Upload Artist"},
    )
    artist_id = artist_resp.json()["id"]

    audio_content = b"\xff\xfb\x90\x00" * 1000
    response = await client.post(
        f"/api/v1/upload/audio?artist_id={artist_id}",
        headers=admin_headers,
        files={"file": ("test.mp3", io.BytesIO(audio_content), "audio/mpeg")},
        data={"title": "Uploaded Track"},
    )
    assert response.status_code == 202
    data = response.json()
    assert "track_id" in data
    assert data["status"] == "processing"


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
