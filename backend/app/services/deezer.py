import re
import io
import httpx
import structlog

logger = structlog.get_logger("app")

DEEZER_API_BASE = "https://api.deezer.com"
DEEZER_SEARCH_URL = f"{DEEZER_API_BASE}/search"

DEEZER_URL_PATTERNS = [
    r"deezer\.com/(\w+)/(\d+)",
    r"deezer\.com/playlist/(\d+)",
]


def extract_playlist_id(url: str) -> str | None:
    """Extract a Deezer playlist ID from a URL."""
    for pattern in DEEZER_URL_PATTERNS:
        match = re.search(pattern, url)
        if match:
            groups = match.groups()
            if len(groups) == 1:
                return groups[0]
            if len(groups) == 2 and groups[0] == "playlist":
                return groups[1]
    if url.strip().isdigit():
        return url.strip()
    return None


async def fetch_deezer_playlist(playlist_id: str) -> dict | None:
    """Fetch a Deezer playlist with all its tracks."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{DEEZER_API_BASE}/playlist/{playlist_id}")
            resp.raise_for_status()
            data = resp.json()

        tracks = []
        for t in data.get("tracks", {}).get("data", []):
            artist = t.get("artist", {})
            album = t.get("album", {})
            tracks.append({
                "title": t.get("title", "Unknown"),
                "artist": artist.get("name", "Unknown"),
                "album": album.get("title", "Unknown"),
                "duration": t.get("duration", 0),
            })

        return {
            "title": data.get("title", "Unknown Playlist"),
            "description": data.get("description", ""),
            "track_count": data.get("nb_tracks", len(tracks)),
            "tracks": tracks,
        }
    except Exception as e:
        logger.error("deezer_playlist_fetch_failed", playlist_id=playlist_id, error=str(e))
        return None


async def search_deezer(query: str, limit: int = 20) -> list[dict]:
    """Search Deezer for tracks and return normalized results."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(DEEZER_SEARCH_URL, params={"q": query, "limit": limit})
            resp.raise_for_status()
            data = resp.json()

        results = []
        for item in data.get("data", []):
            artist = item.get("artist", {})
            album = item.get("album", {})
            results.append({
                "deezer_id": item.get("id"),
                "title": item.get("title_short") or item.get("title", "Unknown"),
                "artist": artist.get("name", "Unknown"),
                "artist_id_deezer": artist.get("id"),
                "album": album.get("title", "Unknown"),
                "album_id_deezer": album.get("id"),
                "duration": item.get("duration", 0),
                "isrc": item.get("isrc"),
                "preview_url": item.get("preview"),
                "cover_url": album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium", ""),
                "artist_picture": artist.get("picture_big") or artist.get("picture_medium", ""),
                "explicit": item.get("explicit_lyrics", False),
                "deezer_url": item.get("link"),
            })

        return results
    except Exception as e:
        logger.error("deezer_search_failed", query=query, error=str(e))
        return []


async def download_deezer_preview(preview_url: str, object_name: str) -> str | None:
    """Download a Deezer preview MP3 and upload to MinIO. Returns the object key."""
    if not preview_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(preview_url)
            resp.raise_for_status()
            content = resp.content

        from app.core.minio import get_minio_client
        from app.core.config import settings

        minio_client = get_minio_client()
        minio_client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            io.BytesIO(content),
            length=len(content),
            content_type="audio/mpeg",
        )
        logger.info("deezer_preview_downloaded", object_name=object_name, size=len(content))
        return object_name
    except Exception as e:
        logger.error("deezer_preview_download_failed", preview_url=preview_url, error=str(e))
        return None
