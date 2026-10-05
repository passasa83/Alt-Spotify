"""Give a genre to the tracks that have none, one lookup per artist."""
from collections import Counter

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artist import Artist
from app.models.track import Track
from app.services.genre_service import canonical_genre, fetch_artist_genre

logger = structlog.get_logger("app")

# One fill at a time: it takes a while (the APIs are rate limited).
_running = False


def is_running() -> bool:
    return _running


async def missing_genres(db: AsyncSession) -> dict:
    """Tracks without genre, and how many artists that means."""
    rows = (
        await db.execute(
            select(Track.artist_id, func.count(Track.id)).where(Track.genre.is_(None)).group_by(Track.artist_id)
        )
    ).all()
    return {"artists": len(rows), "tracks": sum(count for _, count in rows)}


async def artist_genre(
    db: AsyncSession, artist_id, artist_name: str = "", sample_title: str = "", lookup: bool = True
) -> str | None:
    """The genre most of the artist's tracks already have, else (``lookup``)
    one from iTunes / Deezer."""
    known = (
        await db.execute(select(Track.genre).where(Track.artist_id == artist_id, Track.genre.is_not(None)))
    ).scalars().all()
    if known:
        return Counter(known).most_common(1)[0][0]
    return await fetch_artist_genre(artist_name, sample_title) if lookup else None


async def fill_missing_genres(session_factory) -> dict:
    """Set the genre of every track that has none (background job)."""
    global _running
    if _running:
        return {"artists": 0, "tracks": 0, "skipped": "already running"}
    _running = True
    done_artists = done_tracks = 0
    try:
        async with session_factory() as db:
            # Tags in other spellings ("Hip-hop/Rap") count as no usable genre.
            raw = (await db.execute(select(Track.id, Track.genre).where(Track.genre.is_not(None)))).all()
            for track_id, genre in raw:
                canonical = canonical_genre(genre)
                if canonical != genre:
                    await db.execute(update(Track).where(Track.id == track_id).values(genre=canonical))
            await db.commit()

            artists = (
                await db.execute(
                    select(Artist.id, Artist.name, func.min(Track.title))
                    .join(Track, Track.artist_id == Artist.id)
                    .where(Track.genre.is_(None))
                    .group_by(Artist.id, Artist.name)
                )
            ).all()
            for artist_id, name, sample_title in artists:
                genre = await artist_genre(db, artist_id, name, sample_title)
                if genre:
                    result = await db.execute(
                        update(Track).where(Track.artist_id == artist_id, Track.genre.is_(None)).values(genre=genre)
                    )
                    done_artists += 1
                    done_tracks += result.rowcount or 0
                    await db.commit()
            logger.info("genres_fill_done", artists=done_artists, tracks=done_tracks, looked_up=len(artists))
    finally:
        _running = False
    return {"artists": done_artists, "tracks": done_tracks}
