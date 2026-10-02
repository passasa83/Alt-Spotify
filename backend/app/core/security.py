import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(subject: str, token_type: str, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + lifetime,
        # Unique id so a single token can be revoked (logout, refresh rotation).
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    return _encode(subject, "access", expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(subject: str) -> str:
    return _encode(subject, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def create_media_token(subject: str) -> str:
    """Token for URLs (<audio src>, <img src>): streaming and covers only.

    URLs end up in proxy logs and browser history, so they carry this
    restricted token instead of the access token that unlocks the whole API.
    """
    return _encode(subject, "media", timedelta(minutes=settings.MEDIA_TOKEN_EXPIRE_MINUTES))


def decode_token(token: str, allowed_types: tuple[str, ...] = ("access",)) -> dict | None:
    """Payload of a valid, unexpired token of one of ``allowed_types``."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") not in allowed_types or not payload.get("sub"):
        return None
    return payload


def verify_token(token: str, token_type: str = "access") -> str | None:
    payload = decode_token(token, (token_type,))
    return payload.get("sub") if payload else None
