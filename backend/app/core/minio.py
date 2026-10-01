import asyncio
import time

import urllib3
from minio import Minio

from app.core.config import settings
from app.core.exceptions import StorageUnavailableError

_client: Minio | None = None

# urllib3's defaults retry with backoff for ~30 s when MinIO is down, which
# froze uploads (and the whole API when called on the event loop). Fail fast
# on connection errors, keep a generous read timeout for large files.
_HTTP = urllib3.PoolManager(
    timeout=urllib3.Timeout(connect=3, read=120),
    retries=urllib3.Retry(total=2, connect=1, backoff_factor=0.2, status_forcelist=(500, 502, 503, 504)),
    maxsize=10,
)

_bucket_size_cache: tuple[float, int] = (0.0, 0)
_BUCKET_SIZE_CACHE_TTL = 300


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
            http_client=_HTTP,
        )
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)
        # Only cached once the bucket is known to exist.
        _client = client
    return _client


def upload_file(object_name: str, file_data: bytes, content_type: str = "application/octet-stream") -> str:
    """Store bytes in MinIO. Blocking: call it through asyncio.to_thread from async code."""
    from io import BytesIO

    try:
        client = get_minio_client()
        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            BytesIO(file_data),
            length=len(file_data),
            content_type=content_type,
        )
    except StorageUnavailableError:
        raise
    except Exception as e:  # noqa: BLE001 - any storage failure means "not saved"
        raise StorageUnavailableError() from e
    return object_name


def get_file_url(object_name: str, expires: int = 3600) -> str:
    client = get_minio_client()
    return client.presigned_get_object(
        settings.MINIO_BUCKET,
        object_name,
        expires=expires,
    )


def delete_file(object_name: str) -> None:
    client = get_minio_client()
    client.remove_object(settings.MINIO_BUCKET, object_name)


def _list_bucket_size_bytes() -> int:
    client = get_minio_client()
    return sum(obj.size or 0 for obj in client.list_objects(settings.MINIO_BUCKET, recursive=True))


async def get_bucket_size_bytes() -> int:
    """Total bytes stored in the bucket. Listing is a bit expensive, so the
    result is cached for a few minutes instead of redone on every scrape."""
    global _bucket_size_cache
    cached_at, cached_value = _bucket_size_cache
    if time.monotonic() - cached_at < _BUCKET_SIZE_CACHE_TTL:
        return cached_value
    size = await asyncio.to_thread(_list_bucket_size_bytes)
    _bucket_size_cache = (time.monotonic(), size)
    return size
