import uuid

import pytest
from httpx import AsyncClient


async def test_register_device(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "test-device-1",
            "device_name": "Chrome Browser",
            "device_type": "web",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] == "test-device-1"
    assert data["device_name"] == "Chrome Browser"
    assert data["device_type"] == "web"
    assert data["is_active"] is True


async def test_register_device_updates_existing(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-1",
            "device_name": "Old Name",
            "device_type": "web",
        },
        headers=auth_headers,
    )
    response = await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-1",
            "device_name": "New Name",
            "device_type": "mobile",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["device_name"] == "New Name"
    assert data["device_type"] == "mobile"


async def test_list_devices(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-1",
            "device_name": "Device 1",
            "device_type": "web",
        },
        headers=auth_headers,
    )
    await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-2",
            "device_name": "Device 2",
            "device_type": "mobile",
        },
        headers=auth_headers,
    )
    response = await client.get("/api/v1/devices", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


async def test_list_devices_empty(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/devices", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


async def test_device_heartbeat(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-hb",
            "device_name": "Heartbeat Device",
            "device_type": "web",
        },
        headers=auth_headers,
    )
    response = await client.post(
        "/api/v1/devices/heartbeat",
        json={"device_id": "dev-hb"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_device_heartbeat_missing_device_id(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/devices/heartbeat",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_transfer_playback(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-target",
            "device_name": "Target",
            "device_type": "web",
        },
        headers=auth_headers,
    )
    response = await client.post(
        "/api/v1/devices/dev-target/transfer",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["target_device"] == "dev-target"


async def test_transfer_playback_not_found(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/devices/nonexistent/transfer",
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_register_device_unauthenticated(client: AsyncClient):
    response = await client.post(
        "/api/v1/devices/register",
        json={
            "device_id": "dev-1",
            "device_name": "Device",
            "device_type": "web",
        },
    )
    assert response.status_code == 401


async def test_list_devices_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/devices")
    assert response.status_code == 401


async def test_heartbeat_unauthenticated(client: AsyncClient):
    response = await client.post(
        "/api/v1/devices/heartbeat",
        json={"device_id": "dev-1"},
    )
    assert response.status_code == 401


async def test_transfer_unauthenticated(client: AsyncClient):
    response = await client.post("/api/v1/devices/dev-1/transfer")
    assert response.status_code == 401
