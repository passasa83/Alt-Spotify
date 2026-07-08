import json
import hashlib
import functools
from typing import Any, Callable

from app.core.config import settings
from app.core.redis import get_redis


class CacheService:
    def __init__(self):
        self._enabled = settings.CACHE_ENABLED
        self._default_ttl = settings.CACHE_TTL

    async def get(self, key: str, default: Any = None) -> Any:
        if not self._enabled:
            return default
        try:
            r = await get_redis()
            value = await r.get(f"cache:{key}")
            if value is None:
                return default
            return json.loads(value)
        except Exception:
            return default

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self._enabled:
            return
        try:
            r = await get_redis()
            ttl = ttl or self._default_ttl
            await r.setex(f"cache:{key}", ttl, json.dumps(value, default=str))
        except Exception:
            pass

    async def delete(self, key: str) -> None:
        if not self._enabled:
            return
        try:
            r = await get_redis()
            await r.delete(f"cache:{key}")
        except Exception:
            pass

    async def invalidate_pattern(self, pattern: str) -> None:
        if not self._enabled:
            return
        try:
            r = await get_redis()
            keys = []
            async for key in r.scan_iter(f"cache:{pattern}"):
                keys.append(key)
            if keys:
                await r.delete(*keys)
        except Exception:
            pass

    def _make_key(self, prefix: str, *args, **kwargs) -> str:
        raw = f"{prefix}:{args}:{sorted(kwargs.items())}"
        return hashlib.md5(raw.encode()).hexdigest()


cache = CacheService()


def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache function results in Redis."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not cache._enabled:
                return await func(*args, **kwargs)

            cache_key = key_prefix or func.__name__
            key = cache._make_key(cache_key, *args[1:], **kwargs)

            result = await cache.get(key)
            if result is not None:
                return result

            result = await func(*args, **kwargs)
            if result is not None:
                await cache.set(key, result, ttl)
            return result

        wrapper.invalidate = lambda *a, **kw: cache.invalidate_pattern(key_prefix or func.__name__)
        return wrapper
    return decorator
