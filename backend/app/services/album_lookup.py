"""The album of a track, found when the file itself says nothing.

Files scanned from the music folder carry an ``album`` tag, but YouTube
downloads and Deezer previews don't: without a lookup those tracks end up on
no album at all, and their artist pages show no discography.
"""
import re
import unicodedata
import urllib.parse
from difflib import SequenceMatcher

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.album import Album
from app.services.cover_service import _cache_get, _cache_set, _throttled_request

logger = structlog.get_logger("app")

# Lives in the cover cache (Redis, 30 days) under its own prefix.
_CACHE_PREFIX = "album:"


def _fold(text: str) -> str:
    """Lower case, no accents, no punctuation: comparable names."""
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _similar(a: str, b: str) -> float:
    a, b = _fold(a), _fold(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


async def fetch_track_album(artist: str, title: str) -> dict | None:
    """Album of one track from Deezer: ``{"title", "cover"}``, or None.

    A hit that looks like another song by another artist is dropped: a wrong
    album is worse than no album at all.
    """
    if not _fold(artist) or not _fold(title):
        return None
    cache_key = _CACHE_PREFIX + _fold(artist) + "|" + _fold(title)
    found, cached = await _cache_get(cache_key)
    if found:
        return {"title": cached, "cover": None} if cached else None

    # Plain words: Deezer ignores the artist:/track: fields and answers nothing.
    query = f"{artist} {title}".strip()
    data = await _throttled_request(f"https://api.deezer.com/search/track?q={urllib.parse.quote(query)}&limit=3")
    answered = data is not None and "error" not in data
    result = None
    for hit in (data.get("data") if answered else []) or []:
        album = hit.get("album") or {}
        if not album.get("title"):
            continue
        if _similar(artist, (hit.get("artist") or {}).get("name", "")) < 0.6:
            continue
        if _similar(title, hit.get("title") or "") < 0.4:
            continue
        result = {"title": album["title"], "cover": album.get("cover_medium") or album.get("cover_big")}
        break

    # Remember "no album" too, but only when Deezer actually answered:
    # a rate limit must not make every later run give up on the track.
    if answered:
        await _cache_set(cache_key, result["title"] if result else None)
    return result


async def find_or_create_album(db: AsyncSession, title: str, artist_id, cover: str | None = None) -> Album:
    """One album per title and artist, reused by every track found on it."""
    result = await db.execute(select(Album).where(Album.title == title, Album.artist_id == artist_id).limit(1))
    album = result.scalars().first()
    if album:
        if cover and not album.cover_url:
            album.cover_url = cover
        return album
    album = Album(title=title, artist_id=artist_id, cover_url=cover)
    db.add(album)
    await db.flush()
    return album


async def assign_album(db: AsyncSession, track, artist_name: str, album_title: str | None = None) -> bool:
    """Give ``track`` an album: the one its tag names, else the one Deezer knows.

    Does nothing when the track already has an album; returns whether one was
    found now.
    """
    if track.album_id:
        return False
    found = None
    hint = (album_title or "").strip()
    # Importers write "Unknown" when they don't know, not a real album name.
    if hint and _fold(hint) not in {"unknown", "unknown album", "none"}:
        found = {"title": hint, "cover": None}
    if not found:
        found = await fetch_track_album(artist_name, track.title)
    if not found:
        return False
    album = await find_or_create_album(db, found["title"], track.artist_id, found.get("cover"))
    track.album_id = album.id
    await db.flush()
    return True
