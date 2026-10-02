import uuid

import pytest
from httpx import AsyncClient

from app.services.stats import (
    get_total_listening_time,
    get_user_top_artists,
    get_user_top_tracks,
    get_genre_distribution,
    get_listening_streak,
)
from app.models.listening_history import ListeningHistory


async def _seed_listening_history(client, admin_headers, db_session, user_id):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Stats Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": "Stats Track",
            "artist_id": str(artist_id),
            "duration_seconds": 180,
            "genre": "rock",
        },
    )
    track_id = uuid.UUID(track_resp.json()["id"])

    from datetime import datetime, timezone
    history = ListeningHistory(
        user_id=user_id,
        track_id=track_id,
        played_at=datetime.now(timezone.utc),
        duration_listened_seconds=180,
    )
    db_session.add(history)
    await db_session.flush()

    return track_id, artist_id


async def test_top_tracks(client: AsyncClient, auth_headers, admin_headers, db_session, test_user):
    await _seed_listening_history(client, admin_headers, db_session, test_user.id)

    results = await get_user_top_tracks(test_user.id, db_session)
    assert isinstance(results, list)
    if results:
        assert "track" in results[0]
        assert "play_count" in results[0]


async def test_top_artists(client: AsyncClient, auth_headers, admin_headers, db_session, test_user):
    await _seed_listening_history(client, admin_headers, db_session, test_user.id)

    results = await get_user_top_artists(test_user.id, db_session)
    assert isinstance(results, list)
    if results:
        assert "artist" in results[0]
        assert "play_count" in results[0]


async def test_total_listening_time(client: AsyncClient, auth_headers, admin_headers, db_session, test_user):
    await _seed_listening_history(client, admin_headers, db_session, test_user.id)

    total = await get_total_listening_time(test_user.id, db_session)
    assert total >= 180


async def test_genre_distribution(client: AsyncClient, auth_headers, admin_headers, db_session, test_user):
    await _seed_listening_history(client, admin_headers, db_session, test_user.id)

    dist = await get_genre_distribution(test_user.id, db_session)
    assert isinstance(dist, list)
    if dist:
        assert "genre" in dist[0]
        assert "play_count" in dist[0]
        assert "percentage" in dist[0]


async def test_listening_streak(client: AsyncClient, auth_headers, admin_headers, db_session, test_user):
    await _seed_listening_history(client, admin_headers, db_session, test_user.id)

    streak = await get_listening_streak(test_user.id, db_session)
    assert "current_streak" in streak
    assert "longest_streak" in streak


async def test_stats_endpoint(client: AsyncClient, auth_headers, test_user):
    response = await client.get("/api/v1/users/me/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_tracks" in data
    assert "top_artists" in data
    assert "total_minutes" in data
    assert "monthly" in data
    assert "genre_distribution" in data
    assert "listening_by_hour" in data
    assert "streak" in data


async def _played_track(client, admin_headers):
    artist = (await client.post("/api/v1/artists", headers=admin_headers, json={"name": "Dur Artist"})).json()
    track = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={"title": "Dur Track", "artist_id": artist["id"], "duration_seconds": 300},
    )
    return track.json()["id"]


async def test_play_records_listened_duration(client: AsyncClient, auth_headers, admin_headers):
    track_id = await _played_track(client, admin_headers)
    r = await client.post(f"/api/v1/tracks/{track_id}/play", headers=auth_headers, json={"duration_listened_seconds": 125})
    assert r.status_code == 200
    # Old clients without a body still count as a play.
    assert (await client.post(f"/api/v1/tracks/{track_id}/play", headers=auth_headers)).status_code == 200

    stats = (await client.get("/api/v1/users/me/stats", headers=auth_headers)).json()
    assert stats["total_minutes"] == 2
    # Clicking a top track plays it: the player needs its audio fields.
    assert all("file_url" in t and "hls_path" in t for t in stats["top_tracks"])
    history = (await client.get("/api/v1/playlists/user/history", headers=auth_headers)).json()["items"]
    assert sorted(h["duration_listened_seconds"] for h in history) == [0, 125]
    # The player needs the audio fields to play a track again from the history.
    assert all("hls_path" in h["track"] and "file_url" in h["track"] for h in history)
    assert all(h["artist"]["name"] for h in history)


async def test_play_rejects_negative_duration(client: AsyncClient, auth_headers, admin_headers):
    track_id = await _played_track(client, admin_headers)
    r = await client.post(f"/api/v1/tracks/{track_id}/play", headers=auth_headers, json={"duration_listened_seconds": -5})
    assert r.status_code == 422


async def test_streak_counts_today(client: AsyncClient, auth_headers, admin_headers):
    track_id = await _played_track(client, admin_headers)
    await client.post(f"/api/v1/tracks/{track_id}/play", headers=auth_headers, json={"duration_listened_seconds": 30})
    stats = (await client.get("/api/v1/users/me/stats", headers=auth_headers)).json()
    assert stats["streak"] == 1


async def test_wrapped_active_days_counts_days_not_plays(client: AsyncClient, auth_headers, admin_headers):
    from datetime import datetime, timezone

    track_id = await _played_track(client, admin_headers)
    for _ in range(3):
        await client.post(f"/api/v1/tracks/{track_id}/play", headers=auth_headers, json={"duration_listened_seconds": 60})
    year = datetime.now(timezone.utc).year
    wrapped = (await client.get(f"/api/v1/users/me/wrapped/{year}", headers=auth_headers)).json()
    assert wrapped["total_plays"] == 3
    assert wrapped["active_days"] == 1
    assert wrapped["total_seconds"] == 180
