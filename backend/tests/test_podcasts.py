import uuid

import pytest
from httpx import AsyncClient


async def test_create_podcast(client: AsyncClient, admin_headers):
    response = await client.post(
        "/api/v1/podcasts",
        headers=admin_headers,
        json={
            "title": "Test Podcast",
            "description": "A test podcast",
            "author": "Test Author",
            "categories": ["technology", "science"],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Podcast"
    assert data["author"] == "Test Author"
    assert data["episode_count"] == 0


async def test_create_podcast_non_admin(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/podcasts",
        headers=auth_headers,
        json={"title": "Unauthorized Podcast"},
    )
    assert response.status_code == 403


async def test_list_podcasts(client: AsyncClient, admin_headers):
    await client.post(
        "/api/v1/podcasts",
        headers=admin_headers,
        json={"title": "List Podcast"},
    )

    response = await client.get("/api/v1/podcasts")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


async def test_get_podcast(client: AsyncClient, admin_headers):
    create_resp = await client.post(
        "/api/v1/podcasts",
        headers=admin_headers,
        json={"title": "Get Podcast"},
    )
    podcast_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/podcasts/{podcast_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Get Podcast"
    assert "episodes" in data


async def test_get_podcast_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/podcasts/{fake_id}")
    assert response.status_code == 404


async def test_create_episode(client: AsyncClient, admin_headers):
    podcast_resp = await client.post(
        "/api/v1/podcasts",
        headers=admin_headers,
        json={"title": "Episode Podcast"},
    )
    podcast_id = podcast_resp.json()["id"]

    response = await client.post(
        f"/api/v1/podcasts/{podcast_id}/episodes",
        headers=admin_headers,
        json={
            "podcast_id": podcast_id,
            "title": "Episode 1",
            "description": "First episode",
            "duration_seconds": 1800,
            "episode_number": 1,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Episode 1"
    assert data["duration_seconds"] == 1800
    assert data["episode_number"] == 1


async def test_create_episode_podcast_not_found(client: AsyncClient, admin_headers):
    fake_id = uuid.uuid4()
    response = await client.post(
        f"/api/v1/podcasts/{fake_id}/episodes",
        headers=admin_headers,
        json={
            "podcast_id": str(fake_id),
            "title": "Orphan Episode",
            "duration_seconds": 600,
        },
    )
    assert response.status_code == 404


async def test_play_episode(client: AsyncClient, auth_headers, admin_headers):
    podcast_resp = await client.post(
        "/api/v1/podcasts",
        headers=admin_headers,
        json={"title": "Play Episode Podcast"},
    )
    podcast_id = podcast_resp.json()["id"]

    episode_resp = await client.post(
        f"/api/v1/podcasts/{podcast_id}/episodes",
        headers=admin_headers,
        json={
            "podcast_id": podcast_id,
            "title": "Play Me Episode",
            "duration_seconds": 900,
        },
    )
    episode_id = episode_resp.json()["id"]

    response = await client.post(
        f"/api/v1/podcasts/episodes/{episode_id}/play",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Episode play recorded"


async def test_play_episode_not_found(client: AsyncClient, auth_headers):
    fake_id = uuid.uuid4()
    response = await client.post(
        f"/api/v1/podcasts/episodes/{fake_id}/play",
        headers=auth_headers,
    )
    assert response.status_code == 404
