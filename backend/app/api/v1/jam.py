import json
import secrets
import string
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, get_db
from app.core.redis import get_redis
from app.core.security import verify_token
from app.models.jam import JamParticipant, JamSession, JamSessionStatus
from app.models.user import User
from app.utils.deps import get_current_user
from app.utils.ws import relay_channel

router = APIRouter(prefix="/jam", tags=["jam"])


def generate_session_code() -> str:
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


def _serialize_jam_session(session, participants, users_map) -> dict:
    return {
        "id": str(session.id),
        "code": session.code,
        "host_id": str(session.host_id),
        "current_track_id": str(session.current_track_id) if session.current_track_id else None,
        "position_ms": session.position_ms,
        "status": session.status.value,
        "queue": [],
        "participants": [
            {
                "user_id": str(p.user_id),
                "username": users_map[p.user_id].pseudo if p.user_id in users_map else "Unknown",
                "avatar_url": users_map[p.user_id].avatar_url if p.user_id in users_map else None,
                "role": p.role.lower(),
                "joined_at": p.joined_at.isoformat(),
            }
            for p in participants
        ],
        "created_at": session.created_at.isoformat(),
    }


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

    participant = JamParticipant(session_id=session.id, user_id=current_user.id, role="HOST")
    db.add(participant)
    await db.flush()

    participants_result = await db.execute(
        select(JamParticipant).where(JamParticipant.session_id == session.id)
    )
    all_participants = participants_result.scalars().all()

    user_ids = [p.user_id for p in all_participants]
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    return _serialize_jam_session(session, all_participants, users_map)


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
        import io

        import qrcode
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

    participant = JamParticipant(session_id=session.id, user_id=current_user.id, role="MEMBER")
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
        r = await get_redis()
        await r.publish(
            f"jam:{session.id}",
            json.dumps({"type": "participant_joined", "user_id": str(current_user.id)}),
        )
    except Exception:
        pass

    participants_result = await db.execute(
        select(JamParticipant).where(JamParticipant.session_id == session.id)
    )
    all_participants = participants_result.scalars().all()

    user_ids = [p.user_id for p in all_participants]
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    return _serialize_jam_session(session, all_participants, users_map)


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

    remaining = await db.execute(
        select(func.count(JamParticipant.id)).where(JamParticipant.session_id == session_id)
    )
    if (remaining.scalar() or 0) == 0:
        session.status = JamSessionStatus.ENDED
        await db.flush()

    try:
        r = await get_redis()
        await r.publish(
            f"jam:{session_id}",
            json.dumps({"type": "participant_left", "user_id": str(current_user.id)}),
        )
    except Exception:
        pass

    return {"message": "Left session"}


@router.get("/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(JamSession).where(JamSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    participants_result = await db.execute(
        select(JamParticipant).where(JamParticipant.session_id == session_id)
    )
    participants = participants_result.scalars().all()

    user_ids = [p.user_id for p in participants]
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    return _serialize_jam_session(session, participants, users_map)


async def _handle_client_message(r, session_id: uuid.UUID, user_id: str, data: dict, websocket: WebSocket) -> None:
    channel = f"jam:{session_id}"
    msg_type = data.get("type")

    if msg_type in ("track_changed", "queue_updated"):
        async with async_session() as db_session:
            perm_result = await db_session.execute(
                select(JamParticipant).where(
                    JamParticipant.session_id == session_id,
                    JamParticipant.user_id == uuid.UUID(user_id),
                )
            )
            sender = perm_result.scalar_one_or_none()
        if not sender or sender.role == "GUEST":
            await websocket.send_text(json.dumps({"type": "error", "message": "Insufficient permissions"}))
            return
        if msg_type == "track_changed":
            # Skip votes only apply to the track that was playing.
            await r.delete(f"jam:votes:{session_id}")
        await r.publish(channel, json.dumps({**data, "user_id": user_id}))

    elif msg_type == "vote_skip":
        vote_key = f"jam:votes:{session_id}"
        await r.sadd(vote_key, user_id)
        vote_count = await r.scard(vote_key)

        async with async_session() as db_session:
            count_result = await db_session.execute(
                select(func.count(JamParticipant.id)).where(JamParticipant.session_id == session_id)
            )
            participant_count = count_result.scalar() or 0

        threshold = (participant_count // 2) + 1
        if vote_count >= threshold:
            await r.publish(channel, json.dumps({"type": "track_skipped", "user_id": user_id, "votes": vote_count}))
            await r.delete(vote_key)
        else:
            await r.publish(channel, json.dumps({"type": "vote_update", "votes": vote_count, "threshold": threshold}))

    elif msg_type in ("position_update", "playback_state", "chat"):
        await r.publish(channel, json.dumps({**data, "user_id": user_id}))


@router.websocket("/{session_id}/ws")
async def jam_websocket(websocket: WebSocket, session_id: uuid.UUID):
    await websocket.accept()

    # Authenticate via query param token
    token = websocket.query_params.get("token")
    user_id = verify_token(token, token_type="access") if token else None
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Only participants of the session may follow it (it carries the chat).
    async with async_session() as db_session:
        member = await db_session.execute(
            select(JamParticipant.id).where(
                JamParticipant.session_id == session_id,
                JamParticipant.user_id == uuid.UUID(user_id),
            )
        )
        if member.scalar_one_or_none() is None:
            await websocket.close(code=4003, reason="Not a participant of this session")
            return

    r = await get_redis()

    async def on_client_message(data: dict) -> None:
        await _handle_client_message(r, session_id, user_id, data, websocket)

    await relay_channel(websocket, f"jam:{session_id}", on_client_message)
