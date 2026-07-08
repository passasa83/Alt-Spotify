import time

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_COUNT = Counter(
    "altspotify_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "altspotify_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

ACTIVE_WEBSOCKET_CONNECTIONS = Gauge(
    "altspotify_websocket_connections_active",
    "Number of active WebSocket connections",
)

TRACKS_PLAYED_TOTAL = Counter(
    "altspotify_tracks_played_total",
    "Total number of tracks played",
)

STORAGE_BYTES_USED = Gauge(
    "altspotify_storage_bytes_used",
    "Storage bytes used in MinIO",
)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        path = request.url.path

        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time

        REQUEST_COUNT.labels(
            method=method,
            endpoint=path,
            status_code=response.status_code,
        ).inc()

        REQUEST_LATENCY.labels(
            method=method,
            endpoint=path,
        ).observe(duration)

        return response
