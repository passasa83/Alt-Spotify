import asyncio
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_token import PushToken
from app.models.user import User

EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send"


async def register_push_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    push_token: str,
    platform: str,
) -> PushToken:
    existing = await db.execute(
        select(PushToken).where(PushToken.token == push_token)
    )
    token = existing.scalar_one_or_none()

    if token:
        if token.user_id != user_id:
            token.user_id = user_id
        token.platform = platform
        token.last_used_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(token)
        return token

    token = PushToken(
        user_id=user_id,
        token=push_token,
        platform=platform,
    )
    db.add(token)
    await db.flush()
    await db.refresh(token)
    return token


async def remove_push_token(db: AsyncSession, user_id: uuid.UUID, push_token: str) -> bool:
    result = await db.execute(
        select(PushToken).where(
            PushToken.user_id == user_id,
            PushToken.token == push_token,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        return False
    await db.delete(token)
    await db.flush()
    return True


async def remove_all_user_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        select(PushToken).where(PushToken.user_id == user_id)
    )
    tokens = await db.execute(
        select(PushToken).where(PushToken.user_id == user_id)
    )
    for token in tokens.scalars().all():
        await db.delete(token)
    await db.flush()


async def send_push_notification(
    user_id: uuid.UUID,
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    from app.core.database import async_session
    async with async_session() as db:
        result = await db.execute(
            select(PushToken).where(PushToken.user_id == user_id)
        )
        tokens = result.scalars().all()

    if not tokens:
        return {"sent": 0, "failed": 0}

    messages = []
    for token in tokens:
        messages.append({
            "to": token.token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "channelId": "default",
        })

    sent = 0
    failed = 0
    async with httpx.AsyncClient() as client:
        for message in messages:
            try:
                response = await client.post(
                    EXPO_PUSH_API,
                    json=message,
                    timeout=10.0,
                )
                if response.status_code == 200:
                    resp_data = response.json()
                    if resp_data.get("data", {}).get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    return {"sent": sent, "failed": failed}


async def send_bulk_push(
    user_ids: list[uuid.UUID],
    title: str,
    body: str,
    data: dict | None = None,
) -> dict:
    from app.core.database import async_session
    async with async_session() as db:
        result = await db.execute(
            select(PushToken).where(PushToken.user_id.in_(user_ids))
        )
        tokens = result.scalars().all()

    if not tokens:
        return {"sent": 0, "failed": 0}

    messages = []
    for token in tokens:
        messages.append({
            "to": token.token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "channelId": "default",
        })

    sent = 0
    failed = 0
    async with httpx.AsyncClient() as client:
        for message in messages:
            try:
                response = await client.post(
                    EXPO_PUSH_API,
                    json=message,
                    timeout=10.0,
                )
                if response.status_code == 200:
                    resp_data = response.json()
                    if resp_data.get("data", {}).get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    return {"sent": sent, "failed": failed}


async def notify_new_release_push(
    artist_name: str,
    tracks: list[str],
    follower_ids: list[uuid.UUID],
) -> dict:
    title = "New Release"
    body = f"{artist_name} released new music!"
    data = {"type": "new_release", "artist_name": artist_name, "tracks": tracks}
    return await send_bulk_push(follower_ids, title, body, data)


async def notify_jam_invite_push(
    host_name: str,
    session_code: str,
    target_user_ids: list[uuid.UUID],
) -> dict:
    title = "Jam Session Invite"
    body = f"{host_name} invited you to join a Jam session"
    data = {"type": "jam_invite", "session_code": session_code, "host_name": host_name}
    return await send_bulk_push(target_user_ids, title, body, data)


async def notify_follow_push(
    follower_pseudo: str,
    followed_user_id: uuid.UUID,
) -> dict:
    title = "New Follower"
    body = f"{follower_pseudo} started following you"
    data = {"type": "follow", "follower_pseudo": follower_pseudo}
    return await send_push_notification(followed_user_id, title, body, data)
