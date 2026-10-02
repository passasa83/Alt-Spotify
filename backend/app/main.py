import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.compression import CompressionMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    internal_error_handler,
    not_found_handler,
)
from app.core.logging import setup_logging
from app.core.metrics import MetricsMiddleware
from app.core.middleware_logging import ErrorLoggingMiddleware, RequestLoggingMiddleware
from app.core.openapi import custom_openapi
from app.core.rate_limit import RateLimitMiddleware
from app.core.redis import close_redis
from app.core.request_id import RequestIDMiddleware
from app.core.security_enhanced import SecurityHeadersMiddleware
from app.core.trusted_proxy import TrustedProxyMiddleware
from app.services.meilisearch import ensure_indexes, reindex_all

logger = structlog.get_logger("app")


async def _run_background_startup_tasks() -> None:
    """Music scan, cover backfill and search reindex: slow, non-critical for
    the app to start serving requests, so they run after the app is already
    marked ready instead of blocking the lifespan/health check."""
    try:
        await ensure_indexes()
        logger.info("meilisearch_indexes_ready")
        await reindex_all()
        logger.info("meilisearch_reindex_complete")
    except Exception as e:
        logger.warning("meilisearch_init_failed", error=str(e))

    import os

    from app.core.database import async_session
    music_dir = os.environ.get("MUSIC_SCAN_DIR", "")
    download_dir = os.environ.get("MUSIC_DOWNLOAD_DIR", "")
    scan_dirs = [d for d in [music_dir, download_dir] if d and os.path.isdir(d)]
    for scan_dir in scan_dirs:
        try:
            from app.api.v1.music_scanner import scan_directory_internal
            async with async_session() as db:
                result = await scan_directory_internal(scan_dir, db)
                logger.info("auto_scan_complete", scan_dir=scan_dir, **result)
        except Exception as e:
            logger.warning("auto_scan_failed", scan_dir=scan_dir, error=str(e))

    try:
        from sqlalchemy import select

        from app.models.artist import Artist
        from app.models.track import Track
        from app.services.cover_service import fetch_cover
        async with async_session() as db:
            result = await db.execute(select(Track).where((Track.cover_url.is_(None)) | (Track.cover_url.like("local_cover:%"))))
            tracks = list(result.scalars().all())
            if tracks:
                artist_ids = list({t.artist_id for t in tracks if t.artist_id})
                artist_result = await db.execute(select(Artist).where(Artist.id.in_(artist_ids)))
                artist_map = {str(a.id): a.name for a in artist_result.scalars().all()}
                logger.info("auto_fix_covers_start", count=len(tracks))
                fixed = 0
                for track in tracks:
                    artist_name = artist_map.get(str(track.artist_id), "")
                    api_cover = await fetch_cover(track.title, artist_name)
                    if api_cover:
                        track.cover_url = api_cover
                        fixed += 1
                await db.commit()
                logger.info("auto_fix_covers_complete", total=len(tracks), fixed=fixed)
    except Exception as e:
        logger.warning("auto_fix_covers_failed", error=str(e))

    logger.info("background_startup_tasks_complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("application_starting", project=settings.PROJECT_NAME)
    await init_db()
    # Kept on app.state so the task isn't garbage-collected mid-run.
    app.state.startup_task = asyncio.create_task(_run_background_startup_tasks())
    logger.info("application_started", project=settings.PROJECT_NAME)
    yield
    logger.info("application_shutting_down")
    await close_redis()
    logger.info("application_stopped")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    lifespan=lifespan,
)

# Middleware order matters: outermost runs first (request -> response order reversed)
# 1. RequestID (outermost - generates ID first)
app.add_middleware(RequestIDMiddleware)

# 2. Logging (logs every request)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(ErrorLoggingMiddleware)

# 3. Rate limiting
app.add_middleware(RateLimitMiddleware)

# 4. Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 5. Compression
if settings.COMPRESSION_ENABLED:
    app.add_middleware(CompressionMiddleware)

# 6. Metrics
app.add_middleware(MetricsMiddleware)

# 7. CORS (innermost middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Auth uses the Authorization header, not cookies: with a "*" origin list,
    # credentialed cross-site requests stay off.
    allow_credentials="*" not in settings.cors_origins_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Range", "X-Request-ID"],
    expose_headers=["Content-Range", "Accept-Ranges", "Retry-After", "X-Request-ID"],
)

# Added last = outermost: everything below sees the real client IP, taken
# from X-Forwarded-For only when a private-network proxy sent it.
app.add_middleware(TrustedProxyMiddleware)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(404, not_found_handler)
app.add_exception_handler(500, internal_error_handler)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
app.openapi = lambda: custom_openapi(app)


@app.get("/health")
async def health():
    return {"status": "ok"}
