"""Sessions (revocation, rotation, lockout), media tokens and trusted proxies."""
import time

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.security import create_media_token, decode_token
from app.core.trusted_proxy import TrustedProxyMiddleware, is_trusted_proxy

PASSWORD = "TestPass123!"


async def _login(client: AsyncClient, email: str = "test@example.com", password: str = PASSWORD) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_tokens_carry_an_id_and_issue_time(client: AsyncClient, test_user):
    tokens = await _login(client)
    for kind, token in (("access", tokens["access_token"]), ("refresh", tokens["refresh_token"])):
        payload = decode_token(token, (kind,))
        assert payload["jti"] and payload["iat"]


async def test_media_token_only_opens_media_urls(client: AsyncClient, test_user, auth_headers):
    r = await client.get("/api/v1/auth/media-token", headers=auth_headers)
    assert r.status_code == 200
    media = r.json()["media_token"]
    assert decode_token(media, ("media",))["sub"] == str(test_user.id)

    # Accepted in a media URL (here: unknown track -> 404, i.e. auth passed)...
    stream = await client.get(f"/api/v1/tracks/00000000-0000-0000-0000-000000000000/stream?token={media}")
    assert stream.status_code == 404
    # ...but not as an API credential.
    assert (await client.get("/api/v1/users/me", headers=_bearer(media))).status_code == 401
    assert (await client.get("/api/v1/playlists", headers=_bearer(media))).status_code == 401


async def test_logout_revokes_the_session(client: AsyncClient, test_user):
    tokens = await _login(client)
    r = await client.post(
        "/api/v1/auth/logout", headers=_bearer(tokens["access_token"]), json={"refresh_token": tokens["refresh_token"]}
    )
    assert r.status_code == 200
    assert (await client.get("/api/v1/users/me", headers=_bearer(tokens["access_token"]))).status_code == 401
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 401


async def test_refresh_rotates_and_detects_a_stolen_token(client: AsyncClient, test_user, fake_redis):
    tokens = await _login(client)
    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    new = first.json()
    assert new["refresh_token"] != tokens["refresh_token"]

    # Same old token again right away (two tabs): refused, nothing else revoked.
    again = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert again.status_code == 401
    assert (await client.get("/api/v1/users/me", headers=_bearer(new["access_token"]))).status_code == 200

    # Same old token much later: someone else has it -> every session is cut.
    time.sleep(1.1)  # revocation works at one-second granularity
    jti = decode_token(tokens["refresh_token"], ("refresh",))["jti"]
    await fake_redis.set(f"auth:revoked:{jti}", str(int(time.time()) - 3600))
    stolen = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert stolen.status_code == 401
    assert (await client.get("/api/v1/users/me", headers=_bearer(new["access_token"]))).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 401


async def test_password_change_signs_out_other_sessions(client: AsyncClient, test_user):
    other_device = await _login(client)
    this_device = await _login(client)
    time.sleep(1.1)
    r = await client.post(
        "/api/v1/auth/change-password",
        headers=_bearer(this_device["access_token"]),
        json={"current_password": PASSWORD, "new_password": "BrandNewPassw0rd!"},
    )
    assert r.status_code == 200
    fresh = r.json()
    assert fresh["access_token"] and fresh["refresh_token"]

    assert (await client.get("/api/v1/users/me", headers=_bearer(other_device["access_token"]))).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": other_device["refresh_token"]})).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=_bearer(fresh["access_token"]))).status_code == 200


async def test_account_locked_after_repeated_failures(client: AsyncClient, test_user, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    for _ in range(3):
        r = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "wrong"})
        assert r.status_code == 401
    # Even the right password is refused while locked.
    locked = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": PASSWORD})
    assert locked.status_code == 429


async def test_successful_login_resets_the_failure_count(client: AsyncClient, test_user, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    for _ in range(2):
        await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "wrong"})
    await _login(client)
    for _ in range(2):
        await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "wrong"})
    await _login(client)


async def test_disabling_a_user_ends_open_sessions(client: AsyncClient, test_user, admin_headers):
    tokens = await _login(client)
    time.sleep(1.1)
    r = await client.put(f"/api/v1/admin/users/{test_user.id}/active", headers=admin_headers, json={"is_active": False})
    assert r.status_code == 200
    me = await client.get("/api/v1/users/me", headers=_bearer(tokens["access_token"]))
    assert me.status_code in (401, 403)


async def test_deleting_a_user_wipes_personal_data(client: AsyncClient, test_user, admin_headers, db_session):
    await client.put("/api/v1/users/me", headers=_bearer((await _login(client))["access_token"]),
                     json={"bio": "my secret bio", "country": "FR"})
    original_email = test_user.email
    r = await client.delete(f"/api/v1/admin/users/{test_user.id}", headers=admin_headers)
    assert r.status_code == 200
    await db_session.refresh(test_user)
    assert test_user.bio is None and test_user.country is None and test_user.avatar_url is None
    login = await client.post("/api/v1/auth/login", json={"email": original_email, "password": PASSWORD})
    assert login.status_code in (401, 403)


@pytest.mark.parametrize(
    ("host", "trusted"),
    [("172.18.0.5", True), ("10.0.0.2", True), ("192.168.1.10", True), ("127.0.0.1", True),
     ("::1", True), ("8.8.8.8", False), ("82.67.78.175", False), ("not-an-ip", False)],
)
def test_trusted_proxy_addresses(host, trusted):
    assert is_trusted_proxy(host) is trusted


async def _client_seen(peer: str, xff: str | None, proto: str | None = None) -> tuple:
    seen = {}

    async def app(scope, receive, send):
        seen["client"], seen["scheme"] = scope["client"], scope["scheme"]

    headers = []
    if xff:
        headers.append((b"x-forwarded-for", xff.encode()))
    if proto:
        headers.append((b"x-forwarded-proto", proto.encode()))
    scope = {"type": "http", "client": (peer, 1234), "scheme": "http", "headers": headers}
    await TrustedProxyMiddleware(app)(scope, None, None)
    return seen["client"][0], seen["scheme"]


async def test_forwarded_headers_only_from_private_proxies():
    # Through the reverse proxy on the Docker network: real client used.
    assert await _client_seen("172.18.0.5", "203.0.113.7", "https") == ("203.0.113.7", "https")
    # A client spoofing a hop: the rightmost untrusted address wins.
    assert (await _client_seen("172.18.0.5", "1.2.3.4, 203.0.113.7"))[0] == "203.0.113.7"
    # Directly from the internet (port 8000): headers ignored.
    assert await _client_seen("198.51.100.9", "127.0.0.1", "https") == ("198.51.100.9", "http")


async def test_media_token_helper_is_restricted():
    token = create_media_token("someone")
    assert decode_token(token, ("access",)) is None
    assert decode_token(token, ("media",))["sub"] == "someone"
