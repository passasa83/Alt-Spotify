import asyncio
import json
import time
import urllib.parse
import urllib.request

import structlog

from app.core.redis import get_redis

logger = structlog.get_logger("app")

# In-process cache backed by Redis, so a backend restart doesn't lose
# everything already resolved and re-hit iTunes/Deezer for every artist again.
_cover_cache: dict[str, str | None] = {}
_last_request_time: float = 0
_MIN_INTERVAL = 0.35
_REDIS_PREFIX = "cover:"
_REDIS_TTL = 60 * 60 * 24 * 30
_NO_COVER_SENTINEL = "\x00NONE\x00"


async def _cache_get(cache_key: str) -> tuple[bool, str | None]:
    """Returns (found, value). `found` tells apart "looked up, no cover" from
    "never looked up"."""
    if cache_key in _cover_cache:
        return True, _cover_cache[cache_key]
    try:
        r = await get_redis()
        cached = await r.get(_REDIS_PREFIX + cache_key)
    except Exception:
        cached = None
    if cached is None:
        return False, None
    value = None if cached == _NO_COVER_SENTINEL else cached
    _cover_cache[cache_key] = value
    return True, value


async def _cache_set(cache_key: str, value: str | None) -> None:
    _cover_cache[cache_key] = value
    try:
        r = await get_redis()
        await r.set(_REDIS_PREFIX + cache_key, value if value is not None else _NO_COVER_SENTINEL, ex=_REDIS_TTL)
    except Exception:
        pass


async def _throttled_request(url: str) -> dict | None:
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < _MIN_INTERVAL:
        await asyncio.sleep(_MIN_INTERVAL - elapsed)
    _last_request_time = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AltSpotify/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


async def fetch_cover(title: str, artist: str) -> str | None:
    """Fetch album artwork. Caches by artist name to avoid duplicate requests."""
    if not artist:
        return None

    cache_key = artist.lower().strip()
    found, cached_value = await _cache_get(cache_key)
    if found:
        return cached_value

    query = f"{artist} {title}".strip()
    data = await _throttled_request(
        f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': query, 'entity': 'song', 'limit': 1})}"
    )
    if data and data.get("resultCount", 0) > 0:
        artwork = data["results"][0].get("artworkUrl100", "")
        if artwork:
            cover = artwork.replace("100x100", "600x600")
            await _cache_set(cache_key, cover)
            return cover

    data = await _throttled_request(
        f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=1"
    )
    if data and data.get("data") and len(data["data"]) > 0:
        album = data["data"][0].get("album", {})
        cover = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
        if cover:
            await _cache_set(cache_key, cover)
            return cover

    await _cache_set(cache_key, None)
    return None
