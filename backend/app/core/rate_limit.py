import os
import time
from urllib.parse import urlparse

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = structlog.get_logger("app")

RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
DEFAULT_RATE_LIMIT = os.environ.get("RATE_LIMIT_DEFAULT", "100/minute")
AUTH_RATE_LIMIT = os.environ.get("RATE_LIMIT_AUTH", "10/minute")

AUTH_PATHS = frozenset({"/api/v1/auth/login", "/api/v1/auth/register"})
UPLOAD_PATH_PREFIX = "/api/v1/upload"
STREAM_PATH_PREFIX = "/api/v1/tracks/"
STREAM_SUFFIX = "/stream"


def _parse_rate(rate_str: str) -> tuple[int, int]:
    """Parse '100/minute' -> (count, seconds)."""
    parts = rate_str.strip().split("/")
    count = int(parts[0])
    unit = parts[1].lower() if len(parts) > 1 else "minute"
    unit_map = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    return count, unit_map.get(unit, 60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._redis = None

    async def _get_redis(self):
        if self._redis is None:
            try:
                from app.core.redis import redis_pool
                self._redis = redis_pool
            except Exception:
                return None
        return self._redis

    async def _check_rate_limit(self, key: str, limit: int, window: int) -> tuple[bool, int, int]:
        redis = await self._get_redis()
        if redis is None:
            return True, limit, int(time.time()) + window

        now = time.time()
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window)
        results = await pipe.execute()

        request_count = results[2]
        remaining = max(0, limit - request_count)
        reset_at = int(now + window)

        return request_count <= limit, remaining, reset_at

    async def dispatch(self, request: Request, call_next):
        if not RATE_LIMIT_ENABLED:
            return await call_next(request)

        path = request.url.path
        client_ip = request.client.host if request.client else "unknown"

        # Determine rate limit based on path
        if path in AUTH_PATHS:
            limit, window = _parse_rate(AUTH_RATE_LIMIT)
            key = f"rate_limit:auth:{client_ip}"
        elif path.startswith(UPLOAD_PATH_PREFIX):
            limit, window = 10, 3600  # 10/hour
            user_id = getattr(request.state, "user_id", "anon")
            key = f"rate_limit:upload:{user_id}"
        elif path.startswith(STREAM_PATH_PREFIX) and path.endswith(STREAM_SUFFIX):
            limit, window = 30, 60  # 30/minute
            user_id = getattr(request.state, "user_id", "anon")
            key = f"rate_limit:stream:{user_id}"
        else:
            limit, window = _parse_rate(DEFAULT_RATE_LIMIT)
            key = f"rate_limit:general:{client_ip}"

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
            logger.warning("rate_limit_exceeded", path=path, client=client_ip, key=key)
            return response

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
