import urllib.request
import urllib.parse
import json
import structlog

logger = structlog.get_logger("app")


async def fetch_cover_from_itunes(title: str, artist: str) -> str | None:
    """Fetch album artwork from iTunes Search API. Returns 600x600 URL."""
    try:
        query = f"{artist} {title}".strip()
        if not query:
            return None
        url = f"https://itunes.apple.com/search?{urllib.parse.urlencode({'term': query, 'entity': 'song', 'limit': 1})}"
        req = urllib.request.Request(url, headers={"User-Agent": "AltSpotify/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data.get("resultCount", 0) > 0:
                artwork = data["results"][0].get("artworkUrl100", "")
                if artwork:
                    return artwork.replace("100x100", "600x600")
    except Exception as e:
        logger.warning("itunes_cover_error", title=title, artist=artist, error=str(e))
    return None


async def fetch_cover_from_deezer(title: str, artist: str) -> str | None:
    """Fetch album artwork from Deezer Search API."""
    try:
        query = f"{artist} {title}".strip()
        if not query:
            return None
        url = f"https://api.deezer.com/search?q={urllib.parse.quote(query)}&limit=1"
        req = urllib.request.Request(url, headers={"User-Agent": "AltSpotify/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data.get("data") and len(data["data"]) > 0:
                album = data["data"][0].get("album", {})
                cover = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
                if cover:
                    return cover
    except Exception as e:
        logger.warning("deezer_cover_error", title=title, artist=artist, error=str(e))
    return None


async def fetch_cover(title: str, artist: str) -> str | None:
    """Try multiple APIs to find album artwork."""
    cover = await fetch_cover_from_itunes(title, artist)
    if cover:
        return cover
    cover = await fetch_cover_from_deezer(title, artist)
    if cover:
        return cover
    return None
