from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db
from app.core.redis import close_redis
from app.services.meilisearch import ensure_indexes, reindex_all
from app.core.metrics import MetricsMiddleware
from app.core.logging import setup_logging
from app.core.middleware_logging import RequestLoggingMiddleware, ErrorLoggingMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.security_enhanced import SecurityHeadersMiddleware, InputSanitizationMiddleware
from app.core.request_id import RequestIDMiddleware
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    not_found_handler,
    internal_error_handler,
)
from app.core.openapi import custom_openapi
from app.core.compression import CompressionMiddleware
from app.api.v1.router import api_router

logger = structlog.get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("application_starting", project=settings.PROJECT_NAME)
    await init_db()
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
        from app.services.cover_service import fetch_cover
        from app.models.track import Track
        from app.models.artist import Artist
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(select(Track).where((Track.cover_url.is_(None)) | (Track.cover_url.like("local_cover:%"))))
            tracks = list(result.scalars().all())
            if tracks:
                logger.info("auto_fix_covers_start", count=len(tracks))
                fixed = 0
                for track in tracks:
                    artist_result = await db.execute(select(Artist).where(Artist.id == track.artist_id))
                    artist_obj = artist_result.scalar_one_or_none()
                    artist_name = artist_obj.name if artist_obj else ""
                    api_cover = await fetch_cover(track.title, artist_name)
                    if api_cover:
                        track.cover_url = api_cover
                        fixed += 1
                await db.commit()
                logger.info("auto_fix_covers_complete", total=len(tracks), fixed=fixed)
    except Exception as e:
        logger.warning("auto_fix_covers_failed", error=str(e))

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

# 4. Security headers + input sanitization
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InputSanitizationMiddleware)

# 5. Compression
if settings.COMPRESSION_ENABLED:
    app.add_middleware(CompressionMiddleware)

# 6. Metrics
app.add_middleware(MetricsMiddleware)

# 7. CORS (innermost middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(404, not_found_handler)
app.add_exception_handler(500, internal_error_handler)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
app.openapi = lambda: custom_openapi(app)


@app.get("/health")
async def health():
    return {"status": "ok"}
