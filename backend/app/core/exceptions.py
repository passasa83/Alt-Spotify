from fastapi import Request
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger("app")


class AppException(Exception):
    status_code: int = 500
    detail: str = "Internal server error"

    def __init__(self, detail: str | None = None):
        self.detail = detail or self.detail
        super().__init__(self.detail)


class AuthenticationError(AppException):
    status_code = 401
    detail = "Authentication required"


class AuthorizationError(AppException):
    status_code = 403
    detail = "Insufficient permissions"


class NotFoundError(AppException):
    status_code = 404
    detail = "Resource not found"


class ValidationError(AppException):
    status_code = 422
    detail = "Validation error"


class RateLimitError(AppException):
    status_code = 429
    detail = "Rate limit exceeded"


async def app_exception_handler(request: Request, exc: AppException):
    request_id = getattr(request.state, "request_id", "-")
    user_id = getattr(request.state, "user_id", "-")

    logger.warning(
        "app_exception",
        status_code=exc.status_code,
        detail=exc.detail,
        path=request.url.path,
        request_id=request_id,
        user_id=user_id,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


async def not_found_handler(request: Request, exc):
    request_id = getattr(request.state, "request_id", "-")
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found", "request_id": request_id},
    )


async def internal_error_handler(request: Request, exc):
    request_id = getattr(request.state, "request_id", "-")
    logger.error(
        "unhandled_error",
        path=request.url.path,
        request_id=request_id,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )
