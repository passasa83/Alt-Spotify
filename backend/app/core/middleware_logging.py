import json
import time
import traceback

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from app.core.logging import get_access_logger, get_error_logger

logger = structlog.get_logger("app")
access_logger = get_access_logger()
error_logger = get_error_logger()

SKIP_LOG_PATHS = frozenset({"/health", "/metrics", "/docs", "/openapi.json", "/redoc"})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in SKIP_LOG_PATHS):
            return await call_next(request)

        request_id = getattr(request.state, "request_id", "-")
        start = time.time()

        response = await call_next(request)
        duration = round(time.time() - start, 4)

        user_id = "-"
        if hasattr(request.state, "user_id"):
            user_id = str(request.state.user_id)

        log_data = {
            "method": request.method,
            "path": path,
            "status": response.status_code,
            "duration": duration,
            "request_id": request_id,
            "user_id": user_id,
            "client": request.client.host if request.client else "-",
        }

        if response.status_code >= 500:
            error_logger.warning(json.dumps(log_data))
        else:
            access_logger.info(json.dumps(log_data))

        if response.status_code >= 400:
            logger.warning("request_error", **log_data)
        else:
            logger.info("request_completed", **log_data)

        return response


class ErrorLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            request_id = getattr(request.state, "request_id", "-")
            path = request.url.path

            tb = traceback.format_exc()
            error_logger.error(json.dumps({
                "event": "unhandled_exception",
                "request_id": request_id,
                "path": path,
                "method": request.method,
                "traceback": tb,
            }))
            logger.error(
                "unhandled_exception",
                request_id=request_id,
                path=path,
                method=request.method,
            )

            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )
