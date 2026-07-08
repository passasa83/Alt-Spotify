from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class CompressionMiddleware(BaseHTTPMiddleware):
    SKIP_TYPES = {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "application/zip",
    }

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        accept_encoding = request.headers.get("accept-encoding", "")
        if "gzip" not in accept_encoding:
            return response

        content_type = response.headers.get("content-type", "")
        if any(t in content_type for t in self.SKIP_TYPES):
            return response

        body = b""
        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                body += chunk.encode("utf-8")
            else:
                body += chunk

        if len(body) < 1000:
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=content_type,
            )

        import gzip
        compressed = gzip.compress(body, compresslevel=6)

        headers = dict(response.headers)
        headers["content-encoding"] = "gzip"
        headers["content-length"] = str(len(compressed))
        headers["vary"] = "Accept-Encoding"

        return Response(
            content=compressed,
            status_code=response.status_code,
            headers=headers,
            media_type=content_type,
        )
