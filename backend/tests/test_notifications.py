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


async def test_notifications_ws_delivers_without_client_messages(test_user):
    """The client never sends anything: pushes must still reach it."""
    import asyncio

    import app.core.redis as app_redis
    from app.api.v1.notifications import notifications_websocket
    from app.core.security import create_access_token
    from tests.test_jam import _FakeWebSocket

    ws = _FakeWebSocket(create_access_token(str(test_user.id)))
    handler = asyncio.create_task(notifications_websocket(ws))
    for _ in range(100):
        # Publish until the handler has subscribed and forwarded the message.
        await app_redis.redis_pool.publish(f"notifications:{test_user.id}", '{"type": "ping"}')
        if ws.sent:
            break
        await asyncio.sleep(0.01)
    await ws.incoming.put(None)
    await asyncio.wait_for(handler, timeout=2)

    assert ws.sent[0] == '{"type": "ping"}'
    # The shared Redis client must still be usable afterwards.
    assert await app_redis.redis_pool.ping()


async def test_push_is_sent_in_batches():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.services.push_notifications import _send_to_tokens

    tokens = [SimpleNamespace(token=f"ExponentPushToken[{i}]") for i in range(150)]
    responses = [
        MagicMock(status_code=200, json=lambda: {"data": [{"status": "ok"}] * 100}),
        MagicMock(status_code=200, json=lambda: {"data": [{"status": "ok"}] * 49 + [{"status": "error"}]}),
    ]
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=responses) as post:
        result = await _send_to_tokens(tokens, "t", "b")

    assert post.await_count == 2
    assert len(post.await_args_list[0].kwargs["json"]) == 100
    assert result == {"sent": 149, "failed": 1}
