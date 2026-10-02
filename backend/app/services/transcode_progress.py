"""Progress of the HLS transcoding batches started from the admin.

A batch (``POST /upload/transcode-missing``) is recorded in Redis as the list
of (task id, track id) it queued. Its progress is then read from two places:

- the database: a track whose ``hls_path`` is set is done, whatever Celery says
  (task results expire, the database does not);
- Celery's result backend (same Redis): ``STARTED``, ``RETRY`` and ``FAILURE``
  states, with the error of failed tasks.

Every read fails soft: without Redis, only the database figures are returned.
"""
import json
import time
import uuid

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.artist import Artist
from app.models.track import Track

logger = structlog.get_logger("app")

BATCH_KEY = "hls:batch"
# Matches the worker's ``result_expires``: past that, failures are forgotten.
BATCH_TTL = 7 * 86400
# Celery's default queue and result keys in Redis.
CELERY_QUEUE = "celery"
RESULT_PREFIX = "celery-task-meta-"
MAX_LISTED = 50


async def load_batch() -> dict | None:
    try:
        raw = await (await get_redis()).get(BATCH_KEY)
    except Exception as e:  # noqa: BLE001
        logger.warning("transcode_batch_read_failed", error=str(e))
        return None
    return json.loads(raw) if raw else None


async def save_batch(tasks: list[tuple[str, str]], started_at: float | None = None) -> None:
    batch = {"started_at": started_at or time.time(), "tasks": [list(t) for t in tasks]}
    try:
        await (await get_redis()).set(BATCH_KEY, json.dumps(batch), ex=BATCH_TTL)
    except Exception as e:  # noqa: BLE001
        logger.warning("transcode_batch_save_failed", error=str(e))


async def _task_states(task_ids: list[str]) -> list[dict | None]:
    """Celery result of each task (``None`` while it is still queued)."""
    if not task_ids:
        return []
    redis = await get_redis()
    states: list[dict | None] = []
    # MGET in chunks: a batch can hold thousands of tasks.
    for start in range(0, len(task_ids), 500):
        chunk = task_ids[start:start + 500]
        for raw in await redis.mget([RESULT_PREFIX + t for t in chunk]):
            try:
                states.append(json.loads(raw) if raw else None)
            except ValueError:
                states.append(None)
    return states


def _error_text(result: object) -> str:
    """Readable message from a Celery failure payload."""
    if isinstance(result, dict):
        message = result.get("exc_message")
        if isinstance(message, (list, tuple)):
            message = " ".join(str(m) for m in message)
        text = f"{result.get('exc_type', 'Error')}: {message}" if message else str(result.get("exc_type", "Error"))
    else:
        text = str(result)
    return text[:300]


async def pending_track_ids() -> set[str]:
    """Tracks of the current batch that the worker has not finished yet."""
    batch = await load_batch()
    if not batch:
        return set()
    try:
        states = await _task_states([task_id for task_id, _ in batch["tasks"]])
    except Exception as e:  # noqa: BLE001
        logger.warning("transcode_states_read_failed", error=str(e))
        return set()
    return {
        track_id
        for (_, track_id), state in zip(batch["tasks"], states)
        if not state or state.get("status") not in ("SUCCESS", "FAILURE")
    }


async def transcode_progress(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count(Track.id)).where(Track.file_url.isnot(None)))).scalar() or 0
    done_ids = {
        str(i).replace("-", "")
        for i in (await db.execute(select(Track.id).where(Track.hls_path.isnot(None)))).scalars().all()
    }
    progress: dict = {"hls": len(done_ids), "with_source": total, "queue_length": None, "batch": None}

    try:
        progress["queue_length"] = await (await get_redis()).llen(CELERY_QUEUE)
    except Exception as e:  # noqa: BLE001
        logger.warning("transcode_queue_read_failed", error=str(e))

    batch = await load_batch()
    if not batch:
        return progress
    try:
        states = await _task_states([task_id for task_id, _ in batch["tasks"]])
    except Exception as e:  # noqa: BLE001
        logger.warning("transcode_states_read_failed", error=str(e))
        states = [None] * len(batch["tasks"])

    counts = {"done": 0, "running": 0, "queued": 0, "failed": 0}
    running: list[str] = []
    failed: dict[str, str] = {}
    for (_, track_id), state in zip(batch["tasks"], states):
        status = (state or {}).get("status")
        # The database wins: a failed task may have been redone since.
        if track_id.replace("-", "") in done_ids:
            counts["done"] += 1
        elif status == "FAILURE":
            counts["failed"] += 1
            failed[track_id] = _error_text(state.get("result"))
        elif status in ("STARTED", "RETRY"):
            counts["running"] += 1
            running.append(track_id)
        elif status == "SUCCESS":
            # Finished but the track row was gone (deleted meanwhile).
            counts["done"] += 1
        else:
            counts["queued"] += 1

    titles = await _titles(db, running[:MAX_LISTED] + list(failed)[:MAX_LISTED])
    finished = counts["done"] + counts["failed"]
    remaining = counts["running"] + counts["queued"]
    elapsed = max(1.0, time.time() - batch["started_at"])
    progress["batch"] = {
        "started_at": batch["started_at"],
        "total": len(batch["tasks"]),
        **counts,
        # Rough estimate from the pace so far; none until something finished.
        "eta_seconds": int(elapsed / finished * remaining) if finished and remaining else None,
        "running_tracks": [{"id": t, **titles.get(t, {})} for t in running[:MAX_LISTED]],
        "failed_tracks": [
            {"id": t, **titles.get(t, {}), "error": error} for t, error in list(failed.items())[:MAX_LISTED]
        ],
    }
    return progress


async def _titles(db: AsyncSession, track_ids: list[str]) -> dict[str, dict]:
    if not track_ids:
        return {}
    rows = await db.execute(
        select(Track.id, Track.title, Artist.name)
        .outerjoin(Artist, Artist.id == Track.artist_id)
        .where(Track.id.in_([uuid.UUID(t) for t in track_ids]))
    )
    by_hex = {uuid.UUID(str(i)).hex: {"title": title, "artist": artist} for i, title, artist in rows.all()}
    return {t: by_hex.get(uuid.UUID(t).hex, {}) for t in track_ids}
