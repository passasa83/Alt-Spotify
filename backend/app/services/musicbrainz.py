import httpx
import structlog

logger = structlog.get_logger("app")

MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2"
MUSICBRAINZ_HEADERS = {
    "User-Agent": "AltSpotify/1.0 (alt-spotify self-hosted)",
    "Accept": "application/json",
}


async def search_recordings(query: str, limit: int = 10) -> list[dict]:
    """Search MusicBrainz for recordings (tracks) by query string."""
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=MUSICBRAINZ_HEADERS) as client:
            resp = await client.get(
                f"{MUSICBRAINZ_API_BASE}/recording/",
                params={
                    "query": query,
                    "fmt": "json",
                    "limit": limit,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        recordings = data.get("recordings", [])
        results = []
        for rec in recordings:
            artist_name = "Unknown"
            artist_credit = rec.get("artist-credit", [])
            if artist_credit:
                artist_name = artist_credit[0].get("name", "Unknown")

            album_title = "Unknown"
            releases = rec.get("releases", [])
            if releases:
                album_title = releases[0].get("title", "Unknown")

            length_ms = rec.get("length", 0) or 0
            duration = length_ms // 1000

            isrcs = rec.get("isrcs", [])

            results.append({
                "title": rec.get("title", "Unknown"),
                "artist": artist_name,
                "album": album_title,
                "duration": duration,
                "isrc": isrcs[0] if isrcs else None,
                "musicbrainz_id": rec.get("id", ""),
                "disambiguation": rec.get("disambiguation", ""),
            })

        return results
    except Exception as e:
        logger.error("musicbrainz_search_failed", query=query, error=str(e))
        return []


async def search_artists(query: str, limit: int = 5) -> list[dict]:
    """Search MusicBrainz for artists."""
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=MUSICBRAINZ_HEADERS) as client:
            resp = await client.get(
                f"{MUSICBRAINZ_API_BASE}/artist/",
                params={
                    "query": query,
                    "fmt": "json",
                    "limit": limit,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        artists = data.get("artists", [])
        results = []
        for a in artists:
            results.append({
                "name": a.get("name", "Unknown"),
                "disambiguation": a.get("disambiguation", ""),
                "country": a.get("country", ""),
                "musicbrainz_id": a.get("id", ""),
                "type": a.get("type", ""),
            })

        return results
    except Exception as e:
        logger.error("musicbrainz_artist_search_failed", query=query, error=str(e))
        return []


async def get_recording_by_id(musicbrainz_id: str) -> dict | None:
    """Get a single recording by MusicBrainz ID."""
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=MUSICBRAINZ_HEADERS) as client:
            resp = await client.get(
                f"{MUSICBRAINZ_API_BASE}/recording/{musicbrainz_id}",
                params={"fmt": "json"},
            )
            resp.raise_for_status()
            rec = resp.json()

        artist_name = "Unknown"
        artist_credit = rec.get("artist-credit", [])
        if artist_credit:
            artist_name = artist_credit[0].get("name", "Unknown")

        album_title = "Unknown"
        releases = rec.get("releases", [])
        if releases:
            album_title = releases[0].get("title", "Unknown")

        length_ms = rec.get("length", 0) or 0
        isrcs = rec.get("isrcs", [])

        return {
            "title": rec.get("title", "Unknown"),
            "artist": artist_name,
            "album": album_title,
            "duration": length_ms // 1000,
            "isrc": isrcs[0] if isrcs else None,
            "musicbrainz_id": rec.get("id", ""),
        }
    except Exception as e:
        logger.error("musicbrainz_lookup_failed", id=musicbrainz_id, error=str(e))
        return None
