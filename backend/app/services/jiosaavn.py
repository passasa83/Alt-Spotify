import uuid
import httpx
import structlog
from pathlib import Path

from app.core.minio import upload_file

logger = structlog.get_logger("app")

JIOSAAVN_API_BASE = "https://saavn.me"
JIOSAAVN_SEARCH_URL = f"{JIOSAAVN_API_BASE}/search"
JIOSAAVN_SONG_URL = f"{JIOSAAVN_API_BASE}/songs"

JIOSAAVN_TIMEOUT = 3.0


async def search_jiosaavn(query: str, limit: int = 5) -> list[dict]:
    """Search JioSaavn for songs and return normalized results."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(JIOSAAVN_TIMEOUT, connect=2.0)) as client:
            resp = await client.get(JIOSAAVN_SEARCH_URL, params={"song": query})
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "json" not in content_type:
                logger.warning("jiosaavn_not_json", content_type=content_type)
                return []
            data = resp.json()

        songs = data.get("songs", {}).get("data", [])
        results = []
        for song in songs[:limit]:
            download_url = song.get("downloadUrl", [])
            if isinstance(download_url, list):
                mp3_url = None
                for url_obj in download_url:
                    if url_obj.get("quality") == "320kbps":
                        mp3_url = url_obj.get("url")
                        break
                if not mp3_url and download_url:
                    mp3_url = download_url[-1].get("url")
            else:
                mp3_url = download_url

            duration_str = song.get("duration", "0")
            try:
                duration = int(float(duration_str))
            except (ValueError, TypeError):
                duration = 0

            results.append({
                "title": song.get("name", "Unknown"),
                "artist": song.get("primaryArtists", song.get("singers", "Unknown")),
                "album": song.get("album", {}).get("name", "Unknown") if isinstance(song.get("album"), dict) else song.get("album", "Unknown"),
                "image_url": song.get("image", [{}])[-1].get("url", "") if song.get("image") else "",
                "duration": duration,
                "language": song.get("language", ""),
                "year": song.get("year", ""),
                "download_url": mp3_url,
                "jiosaavn_id": song.get("id", ""),
                "jiosaavn_url": song.get("url", ""),
            })

        return results
    except Exception as e:
        logger.error("jiosaavn_search_failed", query=query, error=str(e))
        return []


async def import_from_jiosaavn(song_data: dict, db) -> uuid.UUID | None:
    """Download a song from JioSaavn and import it into the database.
    Returns the track_id if successful, None otherwise.
    """
    from app.models.track import Track
    from app.models.artist import Artist
    from sqlalchemy import select

    download_url = song_data.get("download_url")
    if not download_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(download_url)
            resp.raise_for_status()
            file_data = resp.content

        if len(file_data) < 10000:
            logger.warning("jiosaavn_file_too_small", size=len(file_data))
            return None

        track_id = uuid.uuid4()
        ext = ".mp3"
        object_name = f"audio/{track_id}{ext}"

        upload_file(object_name, file_data, "audio/mpeg")

        artist_name = song_data.get("artist", "Unknown")
        if isinstance(artist_name, list):
            artist_name = ", ".join(artist_name)

        result = await db.execute(
            select(Artist).where(Artist.name.ilike(f"%{artist_name.split(',')[0].strip()}%"))
        )
        found_artist = result.scalars().first()
        if not found_artist:
            found_artist = Artist(name=artist_name.split(",")[0].strip())
            db.add(found_artist)
            await db.flush()
        artist_id = found_artist.id

        track = Track(
            id=track_id,
            title=song_data.get("title", "Unknown"),
            artist_id=artist_id,
            duration_seconds=song_data.get("duration", 0),
            file_url=object_name,
            genre=None,
            is_explicit=False,
            play_count=0,
        )
        db.add(track)
        await db.flush()

        logger.info(
            "jiosaavn_imported",
            track_id=str(track_id),
            title=song_data.get("title"),
            artist=artist_name,
        )

        try:
            from worker.tasks import transcode_audio
            transcode_audio.delay(object_name, f"hls/{track_id}", str(track_id))
        except Exception as e:
            logger.warning("celery_transcode_dispatch_failed", error=str(e))

        return track_id

    except Exception as e:
        logger.error("jiosaavn_import_failed", title=song_data.get("title"), error=str(e))
        return None
