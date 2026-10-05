"""Download an artist's whole discography when someone searches for them.

Searching exactly an artist's name queues an "artist" job (one Deezer call,
the search stays fast). A single background worker, started with the app,
then turns the job into tracks (Deezer albums, EPs and singles, without
compilations, each song once) and downloads them one at a time with yt-dlp,
pausing between downloads so YouTube does not block the server. The queue
lives in Redis, so it survives restarts.
"""
import asyncio
import json
import time
from datetime import date

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track
from app.models.user import User, UserRole

logger = structlog.get_logger("app")

DEEZER_API = "https://api.deezer.com"
ARTIST_QUEUE = "artist-import:artists"
TRACK_QUEUE = "artist-import:tracks"
_STATUS = "artist-import:status:"
_USER_QUOTA = "artist-import:quota:"
# The same artist is not imported again for a week.
STATUS_TTL = 7 * 86400
DAILY_ARTISTS_PER_USER = 5
MAX_TRACKS_PER_ARTIST = 300
# Seconds between two downloads: bursts get the server blocked by YouTube.
PAUSE_BETWEEN_DOWNLOADS = 5
# Album types, preferred first: a song on an album and as a single is kept
# from the album.
_RELEASE_ORDER = {"album": 0, "ep": 1, "single": 2}


def _norm(text: str) -> str:
    from app.services.admin_overview import normalize_title

    return normalize_title(text or "")


async def _deezer(client: httpx.AsyncClient, path: str, **params) -> dict | None:
    try:
        response = await client.get(f"{DEEZER_API}{path}", params=params)
        data = response.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("deezer_request_failed", path=path, error=str(e))
        return None
    if not isinstance(data, dict) or "error" in data:
        return None
    return data


# The search runs as the user types: remember recent answers (10 min).
_match_cache: dict[str, tuple[float, dict | None]] = {}
_MATCH_TTL = 600


async def match_artist(query: str) -> dict | None:
    """The Deezer artist whose name is exactly the query (accents and case
    aside): a partial word or a typo must not start a whole discography."""
    wanted = _norm(query)
    if len(wanted) < 2:
        return None
    cached = _match_cache.get(wanted)
    if cached and time.time() - cached[0] < _MATCH_TTL:
        return cached[1]
    async with httpx.AsyncClient(timeout=8.0) as client:
        data = await _deezer(client, "/search/artist", q=query, limit=5)
    found = None
    for item in (data or {}).get("data", []):
        if _norm(item.get("name", "")) == wanted:
            found = {"id": item["id"], "name": item["name"], "picture": item.get("picture_big") or item.get("picture_medium")}
            break
    if data is not None:
        _match_cache[wanted] = (time.time(), found)
    return found


async def _redis():
    from app.core.redis import get_redis

    return await get_redis()


async def get_status(deezer_artist_id: int | str) -> dict | None:
    try:
        raw = await (await _redis()).get(_STATUS + str(deezer_artist_id))
    except Exception:  # noqa: BLE001
        return None
    return json.loads(raw) if raw else None


async def _set_status(deezer_artist_id, status: dict) -> None:
    redis = await _redis()
    await redis.set(_STATUS + str(deezer_artist_id), json.dumps(status), ex=STATUS_TTL)


async def _bump(deezer_artist_id, field: str) -> None:
    status = await get_status(deezer_artist_id)
    if status is not None:
        status[field] = status.get(field, 0) + 1
        if status.get("done", 0) + status.get("failed", 0) >= status.get("total", 0) and status.get("state") == "downloading":
            status["state"] = "finished"
        await _set_status(deezer_artist_id, status)


async def request_import(query: str, user: User) -> dict | None:
    """Called by the search: queue the discography of the artist named
    ``query``. Returns the import status to show, or None (no such artist)."""
    try:
        artist = await match_artist(query)
        if not artist:
            return None
        status = await get_status(artist["id"])
        if status:
            return {**status, "deezer_id": artist["id"]}

        redis = await _redis()
        if user.role != UserRole.ADMIN:
            quota_key = f"{_USER_QUOTA}{user.id}:{date.today().isoformat()}"
            used = await redis.incr(quota_key)
            await redis.expire(quota_key, 86400)
            if used > DAILY_ARTISTS_PER_USER:
                return {"artist": artist["name"], "deezer_id": artist["id"], "state": "quota", "limit": DAILY_ARTISTS_PER_USER}

        status = {"artist": artist["name"], "state": "preparing", "total": 0, "done": 0, "failed": 0, "queued_at": time.time()}
        await _set_status(artist["id"], status)
        await redis.rpush(ARTIST_QUEUE, json.dumps(artist))
        logger.info("artist_import_requested", artist=artist["name"], deezer_id=artist["id"], user_id=str(user.id))
        return {**status, "deezer_id": artist["id"]}
    except Exception as e:  # noqa: BLE001
        # Never break the search because of the import.
        logger.warning("artist_import_request_failed", query=query, error=str(e))
        return None


async def fetch_discography(deezer_artist_id: int) -> list[dict]:
    """Every song of the artist on Deezer, once: albums first, then EPs and
    singles; compilations and other artists' releases left out."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        albums: list[dict] = []
        index = 0
        while True:
            page = await _deezer(client, f"/artist/{deezer_artist_id}/albums", limit=100, index=index)
            if not page:
                break
            albums.extend(page.get("data", []))
            if not page.get("next") or not page.get("data"):
                break
            index += len(page["data"])
            await asyncio.sleep(0.2)
        albums = [a for a in albums if a.get("record_type") in _RELEASE_ORDER]
        albums.sort(key=lambda a: (_RELEASE_ORDER[a["record_type"]], a.get("release_date") or ""))

        songs: list[dict] = []
        seen: set[str] = set()
        for album in albums:
            detail = await _deezer(client, f"/album/{album['id']}")
            await asyncio.sleep(0.2)  # Deezer allows 50 requests / 5 s
            if not detail:
                continue
            genres = [g.get("name") for g in (detail.get("genres") or {}).get("data", [])]
            for item in (detail.get("tracks") or {}).get("data", []):
                if str((item.get("artist") or {}).get("id")) != str(deezer_artist_id):
                    continue
                key = _norm(item.get("title_short") or item.get("title", ""))
                if not key or key in seen:
                    continue
                seen.add(key)
                songs.append({
                    "title": item.get("title_short") or item.get("title"),
                    "duration": item.get("duration") or 0,
                    "isrc": item.get("isrc"),
                    "explicit": bool(item.get("explicit_lyrics")),
                    "album": detail.get("title"),
                    "album_type": album["record_type"],
                    "release_date": detail.get("release_date"),
                    "cover": detail.get("cover_xl") or detail.get("cover_big"),
                    "genres": genres,
                })
                if len(songs) >= MAX_TRACKS_PER_ARTIST:
                    return songs
    return songs


async def _local_artist(db: AsyncSession, name: str, picture: str | None) -> Artist:
    artist = (
        await db.execute(select(Artist).where(func.lower(Artist.name) == name.lower()).limit(1))
    ).scalars().first()
    if not artist:
        artist = Artist(name=name, image_url=picture)
        db.add(artist)
        await db.flush()
    elif picture and not artist.image_url:
        artist.image_url = picture
    return artist


async def create_tracks(db: AsyncSession, artist_info: dict, songs: list[dict]) -> list:
    """Tracks to download: new rows for the songs the library lacks, and the
    rows earlier searches left without audio. Songs with audio are skipped."""
    from datetime import date as date_type

    from app.services.genre_service import canonical_genre

    artist = await _local_artist(db, artist_info["name"], artist_info.get("picture"))
    existing: dict[str, Track] = {}
    for track in (await db.execute(select(Track).where(Track.artist_id == artist.id))).scalars().all():
        existing.setdefault(_norm(track.title), track)
    albums: dict[str, Album] = {}
    to_download = []
    for song in songs:
        known = existing.get(_norm(song["title"]))
        if known is not None and (known.file_url or known.hls_path):
            continue
        album = None
        if song.get("album") and song.get("album_type") != "single":
            album = albums.get(song["album"])
            if album is None:
                album = (
                    await db.execute(
                        select(Album).where(func.lower(Album.title) == song["album"].lower(), Album.artist_id == artist.id)
                    )
                ).scalars().first()
                if album is None:
                    release = None
                    try:
                        release = date_type.fromisoformat(song["release_date"]) if song.get("release_date") else None
                    except ValueError:
                        pass
                    album = Album(title=song["album"], artist_id=artist.id, cover_url=song.get("cover"), release_date=release)
                    db.add(album)
                    await db.flush()
                albums[song["album"]] = album
        genre = next((g for g in map(canonical_genre, song.get("genres") or []) if g), None)
        if known is not None:
            # A row a search created without audio: complete it, then download.
            known.album_id = known.album_id or (album.id if album else None)
            known.cover_url = known.cover_url or song.get("cover")
            known.genre = known.genre or genre
            known.duration_seconds = known.duration_seconds or song.get("duration") or 0
            to_download.append(known)
            continue
        track = Track(
            title=song["title"],
            artist_id=artist.id,
            album_id=album.id if album else None,
            duration_seconds=song.get("duration") or 0,
            cover_url=song.get("cover"),
            isrc=song.get("isrc"),
            is_explicit=song.get("explicit", False),
            genre=genre,
        )
        db.add(track)
        existing[_norm(song["title"])] = track
        to_download.append(track)
    await db.flush()
    return to_download


async def _expand_artist(session_factory, artist_info: dict) -> None:
    songs = await fetch_discography(artist_info["id"])
    async with session_factory() as db:
        created = await create_tracks(db, artist_info, songs)
        track_ids = [str(t.id) for t in created]
        await db.commit()
    redis = await _redis()
    for track_id in track_ids:
        await redis.rpush(TRACK_QUEUE, json.dumps({"track_id": track_id, "deezer_id": artist_info["id"]}))
    status = await get_status(artist_info["id"]) or {"artist": artist_info["name"], "done": 0, "failed": 0}
    status.update(state="downloading" if track_ids else "finished", total=len(track_ids), already=len(songs) - len(track_ids))
    await _set_status(artist_info["id"], status)
    logger.info("artist_import_expanded", artist=artist_info["name"], songs=len(songs), queued=len(track_ids))


async def download_one(session_factory, track_id: str) -> bool:
    """Download one queued track; True when it got its audio."""
    import uuid

    from app.core.tasks import enqueue_transcode
    from app.services.yt_dlp_download import search_and_download

    async with session_factory() as db:
        row = (
            await db.execute(
                select(Track, Artist.name).join(Artist, Artist.id == Track.artist_id).where(Track.id == uuid.UUID(track_id))
            )
        ).first()
        if row is None:
            return False
        track, artist_name = row
        if track.file_url:
            return True
        result = await search_and_download(title=track.title, artist=artist_name, track_id=track_id)
        if not result.get("success"):
            logger.info("artist_import_track_failed", track_id=track_id, error=result.get("error"))
            return False
        track.file_url = result["file_url"]
        if not track.duration_seconds and result.get("youtube_duration"):
            track.duration_seconds = result["youtube_duration"]
        await db.commit()
        file_url = track.file_url
    await enqueue_transcode(track_id, file_url)
    return True


async def run_worker(session_factory, pause: float = PAUSE_BETWEEN_DOWNLOADS) -> None:
    """Background loop: artist jobs first (they fill the track queue), then
    one track download at a time. Runs for the life of the app."""
    logger.info("artist_import_worker_started")
    while True:
        try:
            redis = await _redis()
            item = await redis.blpop([ARTIST_QUEUE, TRACK_QUEUE], timeout=30)
            if not item:
                continue
            queue, payload = item
            job = json.loads(payload)
            if queue == ARTIST_QUEUE:
                await _expand_artist(session_factory, job)
                continue
            ok = await download_one(session_factory, job["track_id"])
            await _bump(job["deezer_id"], "done" if ok else "failed")
            await asyncio.sleep(pause)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            # Redis down, Deezer or yt-dlp failure: keep the worker alive.
            logger.warning("artist_import_worker_error", error=str(e))
            await asyncio.sleep(30)
