import asyncio
import json
import random
import string
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.models.jam import JamSession, JamSessionStatus, JamParticipant
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/jam", tags=["jam"])


def generate_session_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = generate_session_code()
    while True:
        existing = await db.execute(select(JamSession).where(JamSession.code == code))
        if not existing.scalar_one_or_none():
            break
        code = generate_session_code()

    session = JamSession(code=code, host_id=current_user.id, status=JamSessionStatus.ACTIVE)
    db.add(session)
    await db.flush()
    await db.refresh(session)

    participant = JamParticipant(session_id=session.id, user_id=current_user.id)
    db.add(participant)
    await db.flush()

    return {
        "session_id": str(session.id),
        "code": session.code,
        "host_id": str(current_user.id),
        "status": session.status.value,
    }


@router.get("/qr/{session_id}")
async def get_session_qr(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(JamSession).where(JamSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    try:
        import qrcode
        import io
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(session.code)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/png")
    except ImportError:
        return {"code": session.code, "message": "Install qrcode library for QR code generation"}


@router.post("/join/{code}")
async def join_session(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JamSession).where(JamSession.code == code, JamSession.status == JamSessionStatus.ACTIVE)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found or ended")

    existing = await db.execute(
        select(JamParticipant).where(
            JamParticipant.session_id == session.id,
            JamParticipant.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already in session")

    participant = JamParticipant(session_id=session.id, user_id=current_user.id)
    db.add(participant)
    await db.flush()

    from app.services.notifications import create_notification
    await create_notification(
        db,
        user_id=session.host_id,
        type="jam_invite",
        title="Jam Session",
        message=f"{current_user.pseudo} joined your Jam session",
        data={"session_id": str(session.id), "session_code": session.code, "joiner_pseudo": current_user.pseudo},
    )

    from app.services.push_notifications import send_push_notification
    await send_push_notification(
        user_id=session.host_id,
        title="Jam Session",
        body=f"{current_user.pseudo} joined your Jam session",
        data={"type": "jam_invite", "session_code": session.code, "session_id": str(session.id)},
    )

    # Broadcast join via Redis
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.publish(
            f"jam:{session.id}",
            json.dumps({"type": "participant_joined", "user_id": str(current_user.id)}),
        )
        await r.aclose()
    except Exception:
        pass

    return {"session_id": str(session.id), "code": session.code}


@router.post("/leave/{session_id}")
async def leave_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(JamSession).where(JamSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    await db.execute(
        delete(JamParticipant).where(
            JamParticipant.session_id == session_id,
            JamParticipant.user_id == current_user.id,
        )
    )
    await db.flush()

    try:
        import redis.asyncio as aioredis
        from app.core.config import settings
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.publish(
            f"jam:{session_id}",
            json.dumps({"type": "participant_left", "user_id": str(current_user.id)}),
        )
        await r.aclose()
    except Exception:
        pass

    return {"message": "Left session"}


@router.get("/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(JamSession).where(JamSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    participants_result = await db.execute(
        select(JamParticipant).where(JamParticipant.session_id == session_id)
    )
    participants = participants_result.scalars().all()

    return {
        "session_id": str(session.id),
        "code": session.code,
        "host_id": str(session.host_id),
        "current_track_id": str(session.current_track_id) if session.current_track_id else None,
        "position_ms": session.position_ms,
        "status": session.status.value,
        "created_at": session.created_at.isoformat(),
        "participants": [
            {"user_id": str(p.user_id), "joined_at": p.joined_at.isoformat()}
            for p in participants
        ],
    }


@router.websocket("/{session_id}/ws")
async def jam_websocket(websocket: WebSocket, session_id: uuid.UUID):
    await websocket.accept()

    # Authenticate via query param token
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    from app.core.security import verify_token
    user_id = verify_token(token, token_type="access")
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Subscribe to Redis pub/sub for this session
    import redis.asyncio as aioredis
    from app.core.config import settings
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"jam:{session_id}")

    try:
        while True:
            # Check for incoming messages from client
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type in ("track_changed", "queue_updated", "vote_skip", "chat"):
                    # Broadcast to all subscribers via Redis
                    await r.publish(
                        f"jam:{session_id}",
                        json.dumps({**data, "user_id": user_id}),
                    )
            except Exception:
                pass

            # Check for messages from Redis pub/sub
            pub_message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
            if pub_message and pub_message["type"] == "message":
                await websocket.send_text(pub_message["data"])

    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"jam:{session_id}")
        await r.aclose()
