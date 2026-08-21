import uuid
from datetime import date

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.track import Track
from app.models.artist import Artist
from app.models.album import Album


async def _create_artist(db_session):
    artist = Artist(id=uuid.uuid4(), name="Admin Test Artist", image_url=None)
    db_session.add(artist)
    await db_session.flush()
    return artist


async def _create_album(db_session, artist_id):
    album = Album(
        id=uuid.uuid4(),
        title="Admin Test Album",
        artist_id=artist_id,
        release_date=date(2024, 1, 1),
    )
    db_session.add(album)
    await db_session.flush()
    return album


async def _create_track(db_session, artist_id, album_id=None):
    track = Track(
        id=uuid.uuid4(),
        title="Admin Test Track",
        artist_id=artist_id,
        album_id=album_id,
        duration_seconds=180,
        is_explicit=False,
        play_count=42,
    )
    db_session.add(track)
    await db_session.flush()
    return track


async def test_dashboard(client: AsyncClient, admin_headers, db_session):
    artist = await _create_artist(db_session)
    await _create_track(db_session, artist.id)
    response = await client.get("/api/v1/admin/dashboard", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "total_tracks" in data
    assert "plays_today" in data
    assert "storage_used" in data
    assert "active_jam_sessions" in data
    assert data["total_tracks"] >= 1


async def test_dashboard_non_admin(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/admin/dashboard", headers=auth_headers)
    assert response.status_code == 403


async def test_list_users(client: AsyncClient, admin_headers, test_user):
    response = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


async def test_list_users_search(client: AsyncClient, admin_headers, test_user):
    response = await client.get(
        "/api/v1/admin/users?search=testuser", headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


async def test_list_users_filter_role(client: AsyncClient, admin_headers, test_user):
    response = await client.get(
        "/api/v1/admin/users?role=USER", headers=admin_headers
    )
    assert response.status_code == 200


async def test_update_user_role(client: AsyncClient, admin_headers, test_user):
    response = await client.put(
        f"/api/v1/admin/users/{test_user.id}/role",
        json={"role": "ADMIN"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_update_user_role_invalid_role(client: AsyncClient, admin_headers, test_user):
    response = await client.put(
        f"/api/v1/admin/users/{test_user.id}/role",
        json={"role": "SUPERADMIN"},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_update_user_role_invalid_id(client: AsyncClient, admin_headers):
    response = await client.put(
        "/api/v1/admin/users/not-a-uuid/role",
        json={"role": "ADMIN"},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_update_user_role_user_not_found(client: AsyncClient, admin_headers):
    fake_id = str(uuid.uuid4())
    response = await client.put(
        f"/api/v1/admin/users/{fake_id}/role",
        json={"role": "ADMIN"},
        headers=admin_headers,
    )
    assert response.status_code == 404


async def test_toggle_user_active(client: AsyncClient, admin_headers, test_user):
    response = await client.put(
        f"/api/v1/admin/users/{test_user.id}/active",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_toggle_user_active_invalid_id(client: AsyncClient, admin_headers):
    response = await client.put(
        "/api/v1/admin/users/not-a-uuid/active",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_toggle_user_active_not_found(client: AsyncClient, admin_headers):
    fake_id = str(uuid.uuid4())
    response = await client.put(
        f"/api/v1/admin/users/{fake_id}/active",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert response.status_code == 404


async def test_soft_delete_user(client: AsyncClient, admin_headers, test_user):
    response = await client.delete(
        f"/api/v1/admin/users/{test_user.id}",
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_soft_delete_invalid_id(client: AsyncClient, admin_headers):
    response = await client.delete(
        "/api/v1/admin/users/not-a-uuid",
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_soft_delete_not_found(client: AsyncClient, admin_headers):
    fake_id = str(uuid.uuid4())
    response = await client.delete(
        f"/api/v1/admin/users/{fake_id}",
        headers=admin_headers,
    )
    assert response.status_code == 404


async def test_catalogue_stats(client: AsyncClient, admin_headers, db_session):
    artist = await _create_artist(db_session)
    album = await _create_album(db_session, artist.id)
    await _create_track(db_session, artist.id, album.id)
    response = await client.get("/api/v1/admin/catalogue/stats", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_tracks" in data
    assert "total_albums" in data
    assert "total_artists" in data
    assert "tracks_by_genre" in data
    assert "most_played" in data


async def test_catalogue_stats_non_admin(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/admin/catalogue/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_plays_per_day(client: AsyncClient, admin_headers):
    response = await client.get("/api/v1/admin/analytics/plays-per-day", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_active_users(client: AsyncClient, admin_headers):
    response = await client.get("/api/v1/admin/analytics/active-users", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_top_content(client: AsyncClient, admin_headers):
    response = await client.get("/api/v1/admin/analytics/top-content", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_tracks" in data
    assert "top_artists" in data
    assert "top_albums" in data


async def test_dashboard_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/admin/dashboard")
    assert response.status_code == 401


async def test_list_users_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 401


async def test_catalogue_stats_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/admin/catalogue/stats")
    assert response.status_code == 401
