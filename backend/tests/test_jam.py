import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import WebSocketDisconnect
from httpx import AsyncClient

from app.api.v1.jam import jam_websocket
from app.core.security import hash_password, create_access_token
from app.models.jam import JamParticipant, JamSession, JamSessionStatus
from app.models.user import User, UserRole


async def test_create_session(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert "code" in data
    assert data["status"] == "ACTIVE"


async def test_join_session(client: AsyncClient, auth_headers, test_user, db_session):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_data = create_resp.json()
    code = session_data["code"]

    other = User(
        id=uuid.uuid4(),
        email="joiner@example.com",
        hashed_password=hash_password("Pass123!"),
        pseudo="joiner",
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()

    other_token = create_access_token(str(other.id))
    other_headers = {"Authorization": f"Bearer {other_token}"}

    response = await client.post(
        f"/api/v1/jam/join/{code}",
        headers=other_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_data["id"]
    assert data["code"] == code


async def test_join_session_invalid_code(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/jam/join/INVALID",
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_leave_session(client: AsyncClient, auth_headers, test_user):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    response = await client.post(
        f"/api/v1/jam/leave/{session_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Left session"


async def test_get_session(client: AsyncClient, auth_headers):
    create_resp = await client.post(
        "/api/v1/jam/create",
        headers=auth_headers,
    )
    session_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/jam/{session_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert "participants" in data
    assert len(data["participants"]) >= 1


async def test_get_session_not_found(client: AsyncClient, auth_headers):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/v1/jam/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


class _FakeWebSocket:
    """Minimal stand-in for Starlette's WebSocket, driven by a queue."""

    def __init__(self, token: str | None):
        self.query_params = {"token": token} if token else {}
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.sent: list[str] = []
        self.closed_with: int | None = None

    async def accept(self):
        pass

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed_with = code

    async def receive_text(self) -> str:
        message = await self.incoming.get()
        if message is None:
            raise WebSocketDisconnect(code=1000)
        return message

    async def send_text(self, text: str):
        self.sent.append(text)


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session
    return factory


async def _jam_with_member(db_session, user):
    session = JamSession(code="WSTEST", host_id=user.id, status=JamSessionStatus.ACTIVE)
    db_session.add(session)
    await db_session.flush()
    db_session.add(JamParticipant(session_id=session.id, user_id=user.id, role="HOST"))
    await db_session.flush()
    return session


async def test_jam_ws_rejects_non_participants(db_session, test_user):
    session = JamSession(code="NOPE01", host_id=test_user.id, status=JamSessionStatus.ACTIVE)
    db_session.add(session)
    await db_session.flush()
    ws = _FakeWebSocket(create_access_token(str(test_user.id)))
    with patch("app.api.v1.jam.async_session", _session_factory(db_session)):
        await jam_websocket(ws, session.id)
    assert ws.closed_with == 4003


async def test_jam_ws_rejects_missing_token(db_session):
    ws = _FakeWebSocket(None)
    await jam_websocket(ws, uuid.uuid4())
    assert ws.closed_with == 4001


async def test_jam_ws_relays_chat_and_stops_on_disconnect(db_session, test_user):
    session = await _jam_with_member(db_session, test_user)
    ws = _FakeWebSocket(create_access_token(str(test_user.id)))

    with patch("app.api.v1.jam.async_session", _session_factory(db_session)):
        handler = asyncio.create_task(jam_websocket(ws, session.id))
        await ws.incoming.put(json.dumps({"type": "chat", "text": "salut"}))
        for _ in range(100):
            if ws.sent:
                break
            await asyncio.sleep(0.01)
        await ws.incoming.put(None)  # client disconnects
        # Before the fix the handler swallowed the disconnect and never returned.
        await asyncio.wait_for(handler, timeout=2)

    assert ws.closed_with is None
    relayed = json.loads(ws.sent[0])
    assert relayed["type"] == "chat" and relayed["text"] == "salut"
    assert relayed["user_id"] == str(test_user.id)


async def test_leaving_last_participant_ends_session(client: AsyncClient, auth_headers):
    create = await client.post("/api/v1/jam/create", headers=auth_headers)
    session_id = create.json()["id"]
    code = create.json()["code"]
    await client.post(f"/api/v1/jam/leave/{session_id}", headers=auth_headers)

    response = await client.post(f"/api/v1/jam/join/{code}", headers=auth_headers)
    assert response.status_code == 404
