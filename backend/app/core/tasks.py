"""Dispatch background jobs to the Celery worker (see ``worker/``).

Tasks are sent by name so the backend never has to import the worker code,
which lives in a separate Docker image.
"""
import uuid

import structlog
from celery import Celery
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

logger = structlog.get_logger("app")

TRANSCODE_TASK = "tasks.transcode_audio"

celery_client = Celery("altspotify", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_client.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    broker_connection_timeout=3,
)


def hls_prefix(track_id: uuid.UUID | str) -> str:
    return f"hls/{track_id}"


async def enqueue_transcode(track_id: uuid.UUID | str, source_object: str) -> str | None:
    """Queue the HLS transcoding of ``source_object``; return the task id.

    Returns ``None`` if the broker is unreachable: the track stays playable
    through the direct stream, it just won't get HLS variants.
    """
    try:
        result = await run_in_threadpool(
            celery_client.send_task,
            TRANSCODE_TASK,
            args=[source_object, hls_prefix(track_id), str(track_id)],
            retry=False,
        )
    except Exception as e:
        logger.warning("celery_transcode_dispatch_failed", track_id=str(track_id), error=str(e))
        return None
    logger.info("celery_transcode_queued", track_id=str(track_id), task_id=result.id)
    return result.id
