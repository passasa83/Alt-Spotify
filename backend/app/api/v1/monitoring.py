import hmac
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.models.podcast import Episode, Podcast
from app.models.track import Track
from app.models.user import User, UserRole
from app.utils.deps import _resolve_user, require_admin
from app.utils.storage import get_disk_usage

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
        import asyncio

        from app.core.minio import get_minio_client
        # Blocking client that retries for ~30 s when MinIO is down: off the
        # event loop and bounded, like the admin overview.
        bucket_exists = await asyncio.wait_for(
            asyncio.to_thread(lambda: get_minio_client().bucket_exists(settings.MINIO_BUCKET)), timeout=3
        )
        health["services"]["minio"] = {"status": "healthy" if bucket_exists else "degraded"}
    except Exception as e:
        health["services"]["minio"] = {"status": "unhealthy", "error": str(e) or type(e).__name__}
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
async def prometheus_metrics(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Prometheus metrics: per-route traffic, versions... not public.

    A scraper sends ``Authorization: Bearer <METRICS_TOKEN>``; otherwise an
    admin session is required.
    """
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
    from starlette.responses import Response

    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not (settings.METRICS_TOKEN and token and hmac.compare_digest(token, settings.METRICS_TOKEN)):
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        user = await _resolve_user(token, db, request)
        if user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
