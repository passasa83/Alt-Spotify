import uuid

import pytest
from httpx import AsyncClient

from app.services.recommendation import (
    get_similar_tracks,
    get_radio_tracks,
    get_personalized_recommendations,
)
from app.models.track import Track
from sqlalchemy import select


async def _seed_tracks(client, admin_headers, db_session, count=3):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Recommend Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_ids = []
    for i in range(count):
        resp = await client.post(
            "/api/v1/tracks",
            headers=admin_headers,
            json={
                "title": f"Seed Track {i}",
                "artist_id": str(artist_id),
                "duration_seconds": 180 + i * 30,
                "genre": "rock",
            },
        )
        track_ids.append(resp.json()["id"])

    return artist_id, track_ids


async def test_get_similar_tracks(client: AsyncClient, admin_headers, db_session):
    artist_id, track_ids = await _seed_tracks(client, admin_headers, db_session)

    result = await get_similar_tracks(uuid.UUID(track_ids[0]), db_session)
    assert isinstance(result, list)


async def test_get_similar_tracks_nonexistent(client: AsyncClient, db_session):
    result = await get_similar_tracks(uuid.uuid4(), db_session)
    assert result == []


async def test_radio_tracks(client: AsyncClient, admin_headers, db_session):
    artist_id, track_ids = await _seed_tracks(client, admin_headers, db_session)

    result = await get_radio_tracks(uuid.UUID(track_ids[0]), db_session)
    assert isinstance(result, list)


async def test_radio_tracks_nonexistent(client: AsyncClient, db_session):
    result = await get_radio_tracks(uuid.uuid4(), db_session)
    assert result == []


async def test_personalized_recommendations(
    client: AsyncClient, auth_headers, admin_headers, db_session, test_user
):
    await _seed_tracks(client, admin_headers, db_session)

    results = await get_personalized_recommendations(test_user.id, db_session)
    assert isinstance(results, list)


async def test_personalized_recommendations_empty(
    client: AsyncClient, db_session, test_user
):
    results = await get_personalized_recommendations(test_user.id, db_session)
    assert isinstance(results, list)
