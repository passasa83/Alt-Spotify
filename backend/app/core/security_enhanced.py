import os
import re
import html

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger("app")

HSTS_ENABLED = os.environ.get("HSTS_ENABLED", "true").lower() == "true"

DANGEROUS_CHARS = re.compile(r"[<>&\"'/;(){}]")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        )

        if HSTS_ENABLED and request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.query_params:
            sanitized = {}
            for key, value in request.url.query_params.items():
                sanitized[key] = DANGEROUS_CHARS.sub("", value)
            request.scope["query_string"] = "&".join(
                f"{k}={v}" for k, v in sanitized.items()
            ).encode("utf-8")

        return await call_next(request)
