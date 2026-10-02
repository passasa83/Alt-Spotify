import os
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = structlog.get_logger("app")

RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
DEFAULT_RATE_LIMIT = os.environ.get("RATE_LIMIT_DEFAULT", "300/minute")
AUTH_RATE_LIMIT = os.environ.get("RATE_LIMIT_AUTH", "10/minute")
# Audio is fetched in many small requests (range requests, seeks, preloading
# the next track, HLS segments, cover images): count it apart, generously.
MEDIA_RATE_LIMIT = os.environ.get("RATE_LIMIT_MEDIA", "600/minute")
UPLOAD_RATE_LIMIT = os.environ.get("RATE_LIMIT_UPLOAD", "60/hour")

AUTH_PATHS = frozenset({"/api/v1/auth/login", "/api/v1/auth/register"})
UPLOAD_PATH_PREFIX = "/api/v1/upload"
MEDIA_PREFIXES = ("/api/v1/stream/", "/api/v1/local/covers/")


def _parse_rate(rate_str: str) -> tuple[int, int]:
    """Parse '100/minute' -> (count, seconds)."""
    parts = rate_str.strip().split("/")
    count = int(parts[0])
    unit = parts[1].lower() if len(parts) > 1 else "minute"
    unit_map = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    return count, unit_map.get(unit, 60)


def _is_media(path: str) -> bool:
    return (
        path.startswith(MEDIA_PREFIXES)
        or (path.startswith("/api/v1/tracks/") and path.endswith("/stream"))
        or (path.startswith("/api/v1/podcasts/") and path.endswith("/stream"))
    )


def _client_key(request: Request) -> str:
    """The user behind the request when a valid token is present, else the IP.

    Runs before the route's auth dependency, so it reads the token itself
    (header or ``?token=`` for media elements). Keying on the user keeps one
    person's activity from eating everyone else's quota — before this, every
    stream on the server shared a single "anon" bucket.
    """
    from app.core.security import verify_token

    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("token")
    if token:
        user_id = verify_token(token, token_type="access")
        if user_id:
            return f"user:{user_id}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


def classify(request: Request) -> tuple[str, int, int]:
    """(redis key, limit, window in seconds) for this request."""
    path = request.url.path
    if path in AUTH_PATHS:
        # Brute-force protection: per IP, whoever claims to be logged in.
        limit, window = _parse_rate(AUTH_RATE_LIMIT)
        ip = request.client.host if request.client else "unknown"
        return f"rate_limit:auth:{ip}", limit, window
    if path.startswith(UPLOAD_PATH_PREFIX):
        limit, window = _parse_rate(UPLOAD_RATE_LIMIT)
        return f"rate_limit:upload:{_client_key(request)}", limit, window
    if _is_media(path):
        limit, window = _parse_rate(MEDIA_RATE_LIMIT)
        return f"rate_limit:media:{_client_key(request)}", limit, window
    limit, window = _parse_rate(DEFAULT_RATE_LIMIT)
    return f"rate_limit:general:{_client_key(request)}", limit, window


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def _check_rate_limit(self, key: str, limit: int, window: int) -> tuple[bool, int, int]:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
        except Exception:
            return True, limit, int(time.time()) + window

        now = time.time()
        try:
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, now - window)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window)
            results = await pipe.execute()
        except Exception:
            # Redis down: don't turn a cache outage into a full API outage.
            return True, limit, int(now) + window

        request_count = results[2]
        remaining = max(0, limit - request_count)
        reset_at = int(now + window)

        return request_count <= limit, remaining, reset_at

    async def dispatch(self, request: Request, call_next):
        if not RATE_LIMIT_ENABLED:
            return await call_next(request)

        key, limit, window = classify(request)
        allowed, remaining, reset_at = await self._check_rate_limit(key, limit, window)

        if not allowed:
            retry_after = window - int(time.time() - (reset_at - window))
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": max(1, retry_after)},
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                    "Retry-After": str(max(1, retry_after)),
                },
            )
            logger.warning("rate_limit_exceeded", path=request.url.path, key=key)
            return response

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
