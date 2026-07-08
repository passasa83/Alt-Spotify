import hashlib
import hmac
import time
import uuid
from urllib.parse import urlencode

from app.core.config import settings
from app.core.minio import get_minio_client


def _derive_key(user_id: str, device_id: str) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        f"{user_id}:{device_id}".encode(),
        b"alt-spotify-offline-v1",
        iterations=100000,
        dklen=32,
    )


def encrypt_track(file_data: bytes, user_id: str, device_id: str) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _derive_key(user_id, device_id)
    nonce = uuid.uuid4().bytes[:12]
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, file_data, None)
    return nonce + ct


def generate_download_url(track_id: uuid.UUID, user_id: str, device_id: str) -> str:
    client = get_minio_client()

    metadata = {
        "user_id": user_id,
        "device_id": device_id,
        "track_id": str(track_id),
        "encrypted": "true",
    }

    expires = 86400

    url = client.presigned_get_object(
        settings.MINIO_BUCKET,
        f"tracks/{track_id}",
        expires=expires,
    )

    separator = "&" if "?" in url else "?"
    extra_params = urlencode({
        "x-user-id": user_id,
        "x-device-id": device_id,
        "x-encrypted": "true",
        "x-expires": str(int(time.time()) + expires),
    })
    return f"{url}{separator}{extra_params}"
