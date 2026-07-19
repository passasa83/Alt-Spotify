import asyncio
import time
import urllib.request
import urllib.parse
import json
import structlog

logger = structlog.get_logger("app")

_cover_cache: dict[str, str | None] = {}
_last_request_time: float = 0
_MIN_INTERVAL = 0.35


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
    if cache_key in _cover_cache:
        return _cover_cache[cache_key]

    query = f"{artist} {title}".strip()
    data = await _throttled_request(
        f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': query, 'entity': 'song', 'limit': 1})}"
    )
    if data and data.get("resultCount", 0) > 0:
        artwork = data["results"][0].get("artworkUrl100", "")
        if artwork:
            cover = artwork.replace("100x100", "600x600")
            _cover_cache[cache_key] = cover
            return cover

    data = await _throttled_request(
        f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=1"
    )
    if data and data.get("data") and len(data["data"]) > 0:
        album = data["data"][0].get("album", {})
        cover = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
        if cover:
            _cover_cache[cache_key] = cover
            return cover

    _cover_cache[cache_key] = None
    return None
