import time

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.utils.deps import require_admin
from app.utils.storage import get_disk_usage
from app.models.user import User
from app.models.track import Track
from app.models.podcast import Podcast, Episode

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

_start_time = time.time()


@router.get("/health")
async def health_check(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    health = {
        "status": "healthy",
        "timestamp": time.time(),
        "uptime_seconds": int(time.time() - _start_time),
        "services": {},
    }

    try:
        await db.execute(text("SELECT 1"))
        health["services"]["database"] = {"status": "healthy", "type": "postgresql"}
    except Exception as e:
        health["services"]["database"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    try:
        r = await get_redis()
        await r.ping()
        health["services"]["redis"] = {"status": "healthy"}
    except Exception as e:
        health["services"]["redis"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    try:
        from app.core.minio import get_minio_client
        client = get_minio_client()
        bucket_exists = client.bucket_exists("alt-spotify")
        health["services"]["minio"] = {"status": "healthy" if bucket_exists else "degraded"}
    except Exception as e:
        health["services"]["minio"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    return health


@router.get("/stats")
async def system_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0
    total_tracks = (await db.execute(select(func.count(Track.id)))).scalar() or 0
    total_podcasts = (await db.execute(select(func.count(Podcast.id)))).scalar() or 0
    total_episodes = (await db.execute(select(func.count(Episode.id)))).scalar() or 0

    return {
        "active_users": total_users,
        "total_tracks": total_tracks,
        "total_podcasts": total_podcasts,
        "total_episodes": total_episodes,
        "disk_usage": get_disk_usage(),
        "uptime_seconds": int(time.time() - _start_time),
    }


@router.get("/metrics")
async def prometheus_metrics(db: AsyncSession = Depends(get_db)):
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Gauge

    total_users = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0
    total_tracks = (await db.execute(select(func.count(Track.id)))).scalar() or 0

    from starlette.responses import Response
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
