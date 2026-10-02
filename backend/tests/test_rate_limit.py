"""The rate limiter is disabled for the rest of the suite; these tests turn it on."""
import pytest
from httpx import AsyncClient
from starlette.requests import Request

from app.core import rate_limit
from app.core.security import create_access_token


def _request(path: str, headers: dict | None = None, query: str = "", ip: str = "1.2.3.4") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "query_string": query.encode(),
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": (ip, 1234),
    }
    return Request(scope)


def test_media_requests_are_keyed_per_user():
    a, b = create_access_token("user-a"), create_access_token("user-b")
    key_a, _, _ = rate_limit.classify(_request("/api/v1/tracks/x/stream", query=f"token={a}"))
    key_b, _, _ = rate_limit.classify(_request("/api/v1/tracks/x/stream", headers={"Authorization": f"Bearer {b}"}))
    assert key_a == "rate_limit:media:user:user-a"
    assert key_b == "rate_limit:media:user:user-b"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/tracks/abc/stream",
        "/api/v1/stream/abc/master.m3u8",
        "/api/v1/stream/abc/192k/segment_001.ts",
        "/api/v1/local/covers/Artist/cover.jpg",
        "/api/v1/podcasts/p/episodes/e/stream",
    ],
)
def test_audio_and_covers_use_the_media_bucket(path):
    key, limit, _ = rate_limit.classify(_request(path))
    assert key.startswith("rate_limit:media:")
    assert limit >= 300


def test_invalid_token_falls_back_to_ip_and_login_stays_per_ip():
    key, _, _ = rate_limit.classify(_request("/api/v1/playlists", headers={"Authorization": "Bearer junk"}, ip="9.9.9.9"))
    assert key == "rate_limit:general:ip:9.9.9.9"
    token = create_access_token("someone")
    key, limit, _ = rate_limit.classify(_request("/api/v1/auth/login", headers={"Authorization": f"Bearer {token}"}, ip="9.9.9.9"))
    assert key == "rate_limit:auth:9.9.9.9" and limit == 10


async def test_one_user_exhausting_streams_does_not_block_another(
    client: AsyncClient, auth_headers, admin_headers, monkeypatch
):
    monkeypatch.setattr(rate_limit, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit, "MEDIA_RATE_LIMIT", "3/minute")
    path = "/api/v1/tracks/00000000-0000-0000-0000-000000000000/stream"

    codes = [(await client.get(path, headers=auth_headers)).status_code for _ in range(4)]
    assert codes[:3] != [429, 429, 429] and codes[3] == 429  # 4th request over the limit

    # Before the fix every stream shared one "anon" bucket: this was a 429 too.
    other = await client.get(path, headers=admin_headers)
    assert other.status_code != 429
