from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db
from app.core.redis import close_redis
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
    allow_origins=settings.CORS_ORIGINS,
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
