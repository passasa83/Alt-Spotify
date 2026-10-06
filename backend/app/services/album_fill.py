"""Give an album to the tracks that have none (background repair).

Downloads didn't link an album for months, so most of the library sits on no
album at all. New downloads are fixed as they arrive (see ``album_lookup``);
this fills the backlog, one Deezer lookup per track.
"""
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artist import Artist
from app.models.track import Track
from app.services.album_lookup import assign_album

logger = structlog.get_logger("app")

# One fill at a time: it takes a while (Deezer is rate limited).
_running = False


def is_running() -> bool:
    return _running


async def missing_albums(db: AsyncSession) -> dict:
    """Tracks without album, and how many artists that means."""
    rows = (
        await db.execute(
            select(Track.artist_id, func.count(Track.id))
            .where(Track.album_id.is_(None), Track.artist_id.is_not(None))
            .group_by(Track.artist_id)
        )
    ).all()
    return {"artists": len(rows), "tracks": sum(count for _, count in rows)}


async def fill_missing_albums(session_factory) -> dict:
    """Link every track without album to one (background job)."""
    global _running
    if _running:
        return {"artists": 0, "tracks": 0, "skipped": "already running"}
    _running = True
    artists_done = tracks_done = unmatched = 0
    try:
        async with session_factory() as db:
            artists = (
                await db.execute(
                    select(Artist.id, Artist.name)
                    .join(Track, Track.artist_id == Artist.id)
                    .where(Track.album_id.is_(None))
                    .distinct()
                )
            ).all()
            for artist_id, artist_name in artists:
                tracks = (
                    await db.execute(
                        select(Track).where(Track.artist_id == artist_id, Track.album_id.is_(None))
                    )
                ).scalars().all()
                for track in tracks:
                    if await assign_album(db, track, artist_name):
                        tracks_done += 1
                        await db.commit()
                    else:
                        unmatched += 1
                if tracks:
                    artists_done += 1
                    logger.info(
                        "albums_fill_progress",
                        artists=artists_done,
                        tracks=tracks_done,
                        unmatched=unmatched,
                        total_artists=len(artists),
                    )
        logger.info("albums_fill_done", artists=artists_done, tracks=tracks_done, unmatched=unmatched)
    finally:
        _running = False
    return {"artists": artists_done, "tracks": tracks_done, "unmatched": unmatched}
