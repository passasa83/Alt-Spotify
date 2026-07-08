from minio import Minio

from app.core.config import settings

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        if not _client.bucket_exists(settings.MINIO_BUCKET):
            _client.make_bucket(settings.MINIO_BUCKET)
    return _client


def upload_file(object_name: str, file_data: bytes, content_type: str = "application/octet-stream") -> str:
    client = get_minio_client()
    from io import BytesIO

    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )
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
