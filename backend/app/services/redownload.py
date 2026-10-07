"""Fetch the audio again of the tracks whose file disappeared.

A music folder that moved or was wiped leaves rows pointing at a path that no
longer exists: the track errors out on playback and the health page flags it.
The row is kept, only the file pointer (plus duration, cover and album when
they were missing) changes.
"""
import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.track import Track

logger = structlog.get_logger("app")

# One job at a time: each download takes seconds and YouTube rate limits.
_running = False


def is_running() -> bool:
    return _running


async def redownload_missing(track_ids: list, session_factory) -> dict:
    """Download the audio of each track again, one batch after the other.

    Runs in the background (minutes to hours: YouTube is throttled per IP).
    A track that cannot be found again is counted as failed and left alone,
    so the run can simply be started again later for the rest.
    """
    global _running
    if _running:
        return {"downloaded": 0, "failed": 0, "skipped": "already running"}
    _running = True
    downloaded = failed = 0
    try:
        from app.services.yt_dlp_download import search_and_download

        async with session_factory() as db:
            for start in range(0, len(track_ids), 25):
                chunk = track_ids[start : start + 25]
                rows = (
                    await db.execute(
                        select(Track).options(selectinload(Track.artist)).where(Track.id.in_(chunk)).order_by(Track.id)
                    )
                ).scalars().all()
                for track in rows:
                    artist_name = track.artist.name if track.artist else ""
                    try:
                        result = await search_and_download(
                            title=track.title, artist=artist_name, track_id=str(track.id)
                        )
                        if not result.get("success"):
                            # Nothing was written yet: leave the row alone so
                            # the run can simply be started again later.
                            failed += 1
                            logger.warning(
                                "redownload_failed", track=str(track.id), error=str(result.get("error"))[:200]
                            )
                            continue
                        track.file_url = result["file_url"]
                        if not track.duration_seconds and result.get("youtube_duration"):
                            track.duration_seconds = result["youtube_duration"]
                        if not track.cover_url:
                            from app.services.cover_service import fetch_cover

                            api_cover = await fetch_cover(track.title, artist_name)
                            if api_cover:
                                track.cover_url = api_cover
                        if not track.album_id:
                            from app.services.album_lookup import assign_album

                            await assign_album(
                                db, track, artist_name, album_title=(result.get("metadata") or {}).get("album")
                            )
                        await db.commit()
                        downloaded += 1
                    except Exception as exc:  # noqa: BLE001 - one lost track must not stop the run
                        failed += 1
                        # Half-applied changes only: the row keeps its old file.
                        await db.rollback()
                        logger.warning("redownload_failed", track=str(track.id), error=str(exc)[:200])
                logger.info("redownload_progress", downloaded=downloaded, failed=failed, total=len(track_ids))
    finally:
        _running = False
    logger.info("redownload_done", downloaded=downloaded, failed=failed)
    return {"downloaded": downloaded, "failed": failed}
