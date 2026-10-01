import asyncio
import json
from collections.abc import Awaitable, Callable

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.core.redis import get_redis

logger = structlog.get_logger("app")


async def relay_channel(
    websocket: WebSocket,
    channel: str,
    on_client_message: Callable[[dict], Awaitable[None]] | None = None,
) -> None:
    """Forward a Redis pub/sub channel to an accepted websocket.

    Client messages (JSON objects) are passed to ``on_client_message``. Returns
    once the client disconnects or the socket can no longer be written to.
    """
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    async def forward_channel():
        async for event in pubsub.listen():
            if event["type"] == "message":
                await websocket.send_text(event["data"])

    async def read_client():
        while True:
            raw = await websocket.receive_text()
            if on_client_message is None:
                continue
            try:
                data = json.loads(raw)
            except ValueError:
                continue
            if isinstance(data, dict):
                await on_client_message(data)

    # Both loops run until one of them stops: the client disconnecting ends
    # the reader, a closed socket ends the forwarder.
    tasks = [asyncio.create_task(forward_channel()), asyncio.create_task(read_client())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            exc = task.exception()
            if exc is not None and not isinstance(exc, WebSocketDisconnect):
                logger.warning("websocket_relay_error", channel=channel, error=str(exc))
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await pubsub.unsubscribe(channel)
        # Only the pub/sub connection: the Redis client is shared app-wide.
        await pubsub.reset()
