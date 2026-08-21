import uuid

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.track import Track
from app.models.artist import Artist


async def _create_artist(db_session):
    artist = Artist(id=uuid.uuid4(), name="Test Artist", image_url=None)
    db_session.add(artist)
    await db_session.flush()
    return artist


async def _create_track(db_session, artist_id):
    track = Track(
        id=uuid.uuid4(),
        title="Test Track",
        artist_id=artist_id,
        duration_seconds=180,
        is_explicit=False,
        play_count=0,
    )
    db_session.add(track)
    await db_session.flush()
    return track


async def test_add_favorite_track(client: AsyncClient, auth_headers, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id)
    response = await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["message"] == "Added to favorites"


async def test_add_favorite_invalid_type(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/favorites?entity_type=invalid&entity_id=" + str(uuid.uuid4()),
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_add_favorite_duplicate(client: AsyncClient, auth_headers, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id)
    await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    response = await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_remove_favorite(client: AsyncClient, auth_headers, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id)
    await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    response = await client.delete(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    assert response.status_code == 204


async def test_check_favorite(client: AsyncClient, auth_headers, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id)
    response = await client.get(
        "/api/v1/favorites/check?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["is_favorited"] is False

    await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    response = await client.get(
        "/api/v1/favorites/check?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    assert response.json()["is_favorited"] is True


async def test_list_favorites(client: AsyncClient, auth_headers, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id)
    await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(track.id),
        headers=auth_headers,
    )
    response = await client.get(
        "/api/v1/favorites?entity_type=track",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


async def test_list_favorites_empty(client: AsyncClient, auth_headers):
    response = await client.get(
        "/api/v1/favorites?entity_type=track",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_add_favorite_unauthenticated(client: AsyncClient):
    response = await client.post(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(uuid.uuid4()),
    )
    assert response.status_code == 401


async def test_remove_favorite_unauthenticated(client: AsyncClient):
    response = await client.delete(
        "/api/v1/favorites?entity_type=track&entity_id=" + str(uuid.uuid4()),
    )
    assert response.status_code == 401


async def test_check_favorite_unauthenticated(client: AsyncClient):
    response = await client.get(
        "/api/v1/favorites/check?entity_type=track&entity_id=" + str(uuid.uuid4()),
    )
    assert response.status_code == 401


async def test_list_favorites_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/favorites?entity_type=track")
    assert response.status_code == 401
