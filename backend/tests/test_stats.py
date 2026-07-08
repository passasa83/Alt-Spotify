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
    assert "total_listening_seconds" in data
    assert "monthly" in data
    assert "genre_distribution" in data
    assert "listening_by_hour" in data
    assert "listening_streak" in data
