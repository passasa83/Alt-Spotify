import asyncio
import json
import time
import urllib.parse
import urllib.request

import structlog

from app.core.redis import get_redis

logger = structlog.get_logger("app")

# In-process cache backed by Redis, so a backend restart doesn't lose
# everything already resolved and re-hit iTunes/Deezer for every track again.
_cover_cache: dict[str, str | None] = {}
_last_request_time: float = 0
_MIN_INTERVAL = 0.35
# v2: keys used to be the artist alone, so every track of an artist got the
# first cover found for it. Those entries are ignored (and expire).
_REDIS_PREFIX = "cover:v2:"
_REDIS_TTL = 60 * 60 * 24 * 30
_NO_COVER_SENTINEL = "\x00NONE\x00"


def cover_cache_key(title: str, artist: str, album: str | None = None) -> str:
    """Tracks of one album share its cover; otherwise each track has its own."""
    artist_key = artist.lower().strip()
    if album and album.strip():
        return f"{artist_key}|album|{album.lower().strip()}"
    return f"{artist_key}|track|{title.lower().strip()}"


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


def _get_json(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AltSpotify/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


async def _throttled_request(url: str) -> dict | None:
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < _MIN_INTERVAL:
        await asyncio.sleep(_MIN_INTERVAL - elapsed)
    _last_request_time = time.monotonic()
    # urllib blocks: off the event loop, or every lookup freezes the server.
    return await asyncio.to_thread(_get_json, url)


async def fetch_cover(title: str, artist: str, album: str | None = None) -> str | None:
    """Album artwork for a track, from iTunes then Deezer (cached 30 days).

    With ``album`` the album cover is looked up (shared by its tracks),
    otherwise the cover of this very track.
    """
    if not artist:
        return None

    cache_key = cover_cache_key(title, artist, album)
    found, cached_value = await _cache_get(cache_key)
    if found:
        return cached_value

    by_album = bool(album and album.strip())
    query = f"{artist} {album if by_album else title}".strip()
    entity = "album" if by_album else "song"
    data = await _throttled_request(
        f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': query, 'entity': entity, 'limit': 1})}"
    )
    itunes_answered = data is not None
    if data and data.get("resultCount", 0) > 0:
        artwork = data["results"][0].get("artworkUrl100", "")
        if artwork:
            cover = artwork.replace("100x100", "600x600")
            await _cache_set(cache_key, cover)
            return cover

    deezer = "album" if by_album else "track"
    data = await _throttled_request(
        f"https://api.deezer.com/search/{deezer}?q={urllib.parse.quote(query)}&limit=1"
    )
    # Deezer reports quota errors in a 200 response: {"error": {...}}.
    deezer_answered = data is not None and "error" not in data
    if data and data.get("data") and len(data["data"]) > 0:
        first = data["data"][0]
        album_data = first if by_album else first.get("album", {})
        cover = album_data.get("cover_xl") or album_data.get("cover_big") or album_data.get("cover_medium")
        if cover:
            await _cache_set(cache_key, cover)
            return cover

    # "No cover" is remembered only when both services really answered:
    # a timeout or a rate limit must not hide the cover for 30 days.
    if itunes_answered and deezer_answered:
        await _cache_set(cache_key, None)
    return None
