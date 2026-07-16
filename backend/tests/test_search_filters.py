import uuid

import pytest
from httpx import AsyncClient

from app.models.track import Track


async def _create_track_with_metadata(client, admin_headers, artist_id, **kwargs):
    defaults = {
        "title": f"Track {uuid.uuid4().hex[:8]}",
        "artist_id": str(artist_id),
        "duration_seconds": 200,
    }
    defaults.update(kwargs)
    resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json=defaults,
    )
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_search_by_bpm_range(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "BPM Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="Slow Song", bpm=80)
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Fast Song", bpm=140)
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Mid Song", bpm=110)

    response = await client.get("/api/v1/search?q=Song&min_bpm=100&max_bpm=120")
    assert response.status_code == 200
    data = response.json()
    assert "tracks" in data
    titles = [t["title"] for t in data["tracks"]]
    assert "Mid Song" in titles
    assert "Slow Song" not in titles
    assert "Fast Song" not in titles


@pytest.mark.asyncio
async def test_search_by_key(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Key Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="C Major Song", key="C")
    await _create_track_with_metadata(client, admin_headers, artist_id, title="A Minor Song", key="Am")

    response = await client.get("/api/v1/search?q=Song&key=Am")
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["tracks"]]
    assert "A Minor Song" in titles
    assert "C Major Song" not in titles


@pytest.mark.asyncio
async def test_search_by_mood(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Mood Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="Happy Song", mood="happy,energetic")
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Sad Song", mood="sad,melancholic")

    response = await client.get("/api/v1/search?q=Song&mood=happy")
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["tracks"]]
    assert "Happy Song" in titles
    assert "Sad Song" not in titles


@pytest.mark.asyncio
async def test_search_by_duration(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Duration Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="Short Song", duration_seconds=120)
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Long Song", duration_seconds=360)

    response = await client.get("/api/v1/search?q=Song&min_duration=200&max_duration=400")
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["tracks"]]
    assert "Long Song" in titles
    assert "Short Song" not in titles


@pytest.mark.asyncio
async def test_search_by_lyrics(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Lyrics Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(
        client, admin_headers, artist_id,
        title="Love Song",
        lyrics_lrc="[00:00.00]I love you tonight\n[00:05.00]Forever and always",
    )
    await _create_track_with_metadata(
        client, admin_headers, artist_id,
        title="Party Song",
        lyrics_lrc="[00:00.00]Party all night\n[00:05.00]Dance with me",
    )

    response = await client.get("/api/v1/search?q=Song&lyrics=tonight")
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["tracks"]]
    assert "Love Song" in titles
    assert "Party Song" not in titles


@pytest.mark.asyncio
async def test_search_combined_filters(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Combined Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(
        client, admin_headers, artist_id,
        title="Rock Fast", genre="rock", bpm=150, mood="energetic",
    )
    await _create_track_with_metadata(
        client, admin_headers, artist_id,
        title="Rock Slow", genre="rock", bpm=80, mood="calm",
    )
    await _create_track_with_metadata(
        client, admin_headers, artist_id,
        title="Jazz Fast", genre="jazz", bpm=140, mood="energetic",
    )

    response = await client.get("/api/v1/search?q=Fast&genre=rock&min_bpm=120")
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["tracks"]]
    assert "Rock Fast" in titles
    assert "Rock Slow" not in titles
    assert "Jazz Fast" not in titles


@pytest.mark.asyncio
async def test_tracks_list_filter_bpm(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "List BPM Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="Slow", bpm=70)
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Fast", bpm=160)

    response = await client.get("/api/v1/tracks?min_bpm=100", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["items"]]
    assert "Fast" in titles
    assert "Slow" not in titles


@pytest.mark.asyncio
async def test_tracks_list_filter_key(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "List Key Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="C Song", key="C")
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Am Song", key="Am")

    response = await client.get("/api/v1/tracks?key=C", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["items"]]
    assert "C Song" in titles
    assert "Am Song" not in titles


@pytest.mark.asyncio
async def test_tracks_list_filter_mood(client: AsyncClient, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "List Mood Artist"},
    )
    artist_id = artist_resp.json()["id"]

    await _create_track_with_metadata(client, admin_headers, artist_id, title="Energetic", mood="energetic")
    await _create_track_with_metadata(client, admin_headers, artist_id, title="Calm", mood="calm")

    response = await client.get("/api/v1/tracks?mood=energetic", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    titles = [t["title"] for t in data["items"]]
    assert "Energetic" in titles
    assert "Calm" not in titles
