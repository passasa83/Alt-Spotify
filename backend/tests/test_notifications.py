import uuid

import pytest
from httpx import AsyncClient


async def test_list_notifications(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/notifications", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data or isinstance(data, list)


async def test_list_notifications_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/notifications")
    assert response.status_code == 401


async def test_unread_count(client: AsyncClient, auth_headers):
    response = await client.get(
        "/api/v1/notifications/unread-count", headers=auth_headers
    )
    assert response.status_code == 200
    assert "count" in response.json() or "unread_count" in response.json()


async def test_unread_count_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/notifications/unread-count")
    assert response.status_code == 401
