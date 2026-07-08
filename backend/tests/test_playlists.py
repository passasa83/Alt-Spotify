import uuid

import pytest
from httpx import AsyncClient


async def _create_track(client, admin_headers, artist_id, title="Playlist Track"):
    resp = await client.post(
        "/api/v1/tracks",
        headers=admin_headers,
        json={
            "title": title,
            "artist_id": str(artist_id),
            "duration_seconds": 180,
        },
    )
    return resp.json()["id"]


async def test_create_playlist(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={
            "title": "My Playlist",
            "description": "A test playlist",
            "is_public": True,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "My Playlist"
    assert data["description"] == "A test playlist"
    assert data["is_public"] is True


async def test_list_playlists(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "List Playlist"},
    )
    response = await client.get("/api/v1/playlists", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


async def test_get_playlist(client: AsyncClient, auth_headers):
    create_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Get Playlist"},
    )
    playlist_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/playlists/{playlist_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Get Playlist"


async def test_get_playlist_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/playlists/{fake_id}")
    assert response.status_code == 404


async def test_update_playlist(client: AsyncClient, auth_headers):
    create_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Original Title"},
    )
    playlist_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/v1/playlists/{playlist_id}",
        headers=auth_headers,
        json={"title": "Updated Title", "description": "New desc"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Title"


async def test_update_playlist_not_owner(client: AsyncClient, auth_headers, test_user, db_session):
    from app.core.security import hash_password
    from app.models.user import User, UserRole

    other = User(
        id=uuid.uuid4(),
        email="other@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="otheruser",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()

    create_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Owner Playlist"},
    )
    playlist_id = create_resp.json()["id"]

    from app.core.security import create_access_token
    other_token = create_access_token(str(other.id))
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = await client.put(
        f"/api/v1/playlists/{playlist_id}",
        headers=other_headers,
        json={"title": "Hacked Title"},
    )
    assert response.status_code == 403


async def test_delete_playlist(client: AsyncClient, auth_headers):
    create_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Delete Playlist"},
    )
    playlist_id = create_resp.json()["id"]

    response = await client.delete(
        f"/api/v1/playlists/{playlist_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204

    get_resp = await client.get(f"/api/v1/playlists/{playlist_id}")
    assert get_resp.status_code == 404


async def test_add_track_to_playlist(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Playlist Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_id = await _create_track(client, admin_headers, artist_id)

    playlist_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Add Track Playlist"},
    )
    playlist_id = playlist_resp.json()["id"]

    response = await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track_id)},
    )
    assert response.status_code == 201


async def test_add_track_to_playlist_duplicate(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Dup Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_id = await _create_track(client, admin_headers, artist_id)

    playlist_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Dup Playlist"},
    )
    playlist_id = playlist_resp.json()["id"]

    await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track_id)},
    )

    response = await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track_id)},
    )
    assert response.status_code == 409


async def test_remove_track_from_playlist(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Remove Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_id = await _create_track(client, admin_headers, artist_id)

    playlist_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Remove Track Playlist"},
    )
    playlist_id = playlist_resp.json()["id"]

    await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track_id)},
    )

    response = await client.delete(
        f"/api/v1/playlists/{playlist_id}/tracks/{track_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204


async def test_reorder_playlist(client: AsyncClient, auth_headers, admin_headers):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Reorder Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track1 = await _create_track(client, admin_headers, artist_id, "Track A")
    track2 = await _create_track(client, admin_headers, artist_id, "Track B")

    playlist_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Reorder Playlist"},
    )
    playlist_id = playlist_resp.json()["id"]

    await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track1)},
    )
    await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=auth_headers,
        json={"track_id": str(track2)},
    )

    response = await client.put(
        f"/api/v1/playlists/{playlist_id}/reorder",
        headers=auth_headers,
        json=[
            {"track_id": str(track1), "new_position": 1},
            {"track_id": str(track2), "new_position": 0},
        ],
    )
    assert response.status_code == 200


async def test_add_track_unauthorized(client: AsyncClient, auth_headers, admin_headers, db_session):
    from app.core.security import hash_password, create_access_token
    from app.models.user import User, UserRole

    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Unauth Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_id = await _create_track(client, admin_headers, artist_id)

    playlist_resp = await client.post(
        "/api/v1/playlists",
        headers=auth_headers,
        json={"title": "Private Playlist", "is_collaborative": False},
    )
    playlist_id = playlist_resp.json()["id"]

    other = User(
        id=uuid.uuid4(),
        email="stranger@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="stranger",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()

    other_token = create_access_token(str(other.id))
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = await client.post(
        f"/api/v1/playlists/{playlist_id}/tracks",
        headers=other_headers,
        json={"track_id": str(track_id)},
    )
    assert response.status_code == 403
