"""Find and re-fetch covers wrongly shared between tracks of one artist.

The cover cache used to be keyed by artist only: every track an artist got
during 30 days received the cover found for the first one. Such a cover now
sits on tracks of different albums (or with no album, each one being its own
single). Those tracks are looked up again, one by one.
"""
from collections import defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track

logger = structlog.get_logger("app")

# One repair at a time: it takes minutes (the cover APIs are rate limited).
_running = False


async def suspect_track_ids(db: AsyncSession) -> list:
    """Tracks whose external cover is shared with tracks of other albums."""
    rows = (
        await db.execute(
            select(Track.id, Track.artist_id, Track.album_id, Track.cover_url).where(Track.cover_url.like("http%"))
        )
    ).all()
    groups: dict[tuple, list] = defaultdict(list)
    for track_id, artist_id, album_id, cover in rows:
        groups[(str(artist_id), cover)].append((track_id, album_id))
    suspects = []
    for members in groups.values():
        # A track without album is its own release: sharing a cover is suspect.
        albums = {str(album_id) if album_id else f"single:{track_id}" for track_id, album_id in members}
        if len(albums) > 1:
            suspects.extend(track_id for track_id, _ in members)
    return suspects


async def recheck_covers(track_ids: list, session_factory) -> dict:
    """Re-fetch the cover of each track (by album when it has one)."""
    global _running
    if _running:
        return {"checked": 0, "changed": 0, "skipped": "already running"}
    _running = True
    from app.services.cover_service import fetch_cover

    checked = changed = 0
    try:
        async with session_factory() as db:
            for start in range(0, len(track_ids), 50):
                chunk = track_ids[start:start + 50]
                rows = (
                    await db.execute(
                        select(Track, Artist.name, Album.title)
                        .join(Artist, Artist.id == Track.artist_id)
                        .outerjoin(Album, Album.id == Track.album_id)
                        .where(Track.id.in_(chunk))
                    )
                ).all()
                for track, artist_name, album_title in rows:
                    cover = await fetch_cover(track.title, artist_name, album_title)
                    checked += 1
                    # Nothing found: keep the old cover rather than none.
                    if cover and cover != track.cover_url:
                        track.cover_url = cover
                        changed += 1
                await db.commit()
                logger.info("covers_recheck_progress", checked=checked, changed=changed, total=len(track_ids))
    finally:
        _running = False
    logger.info("covers_recheck_done", checked=checked, changed=changed)
    return {"checked": checked, "changed": changed}


def is_running() -> bool:
    return _running
