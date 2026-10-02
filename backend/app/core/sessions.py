"""Server-side session control on top of stateless JWTs (backed by Redis).

- revoke one token by its ``jti`` (logout, refresh-token rotation);
- revoke every token of a user issued before now (password change, account
  disabled, stolen refresh token detected).

Redis being down must not lock everybody out: checks then fail open and log.
"""
import time

import structlog

from app.core.config import settings
from app.core.redis import get_redis

logger = structlog.get_logger("app")

_REVOKED = "auth:revoked:"
_VALID_AFTER = "auth:valid_after:"


async def revoke_token(jti: str | None, exp: int | float | None) -> None:
    """Mark a token as revoked until it would have expired anyway."""
    if not jti:
        return
    ttl = max(1, int((exp or time.time() + 60) - time.time()))
    try:
        await (await get_redis()).set(_REVOKED + jti, str(int(time.time())), ex=ttl)
    except Exception as e:  # noqa: BLE001
        logger.warning("token_revoke_failed", error=str(e))


async def revoked_at(jti: str | None) -> int | None:
    """When the token was revoked (epoch seconds), or None if it is not."""
    if not jti:
        return None
    try:
        value = await (await get_redis()).get(_REVOKED + jti)
    except Exception as e:  # noqa: BLE001
        logger.warning("token_revocation_check_failed", error=str(e))
        return None
    return int(float(value)) if value else None


async def revoke_all_for_user(user_id: str) -> None:
    """Every token issued before this second stops working."""
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    try:
        await (await get_redis()).set(_VALID_AFTER + str(user_id), str(int(time.time())), ex=ttl)
    except Exception as e:  # noqa: BLE001
        logger.warning("revoke_all_failed", user_id=str(user_id), error=str(e))


async def issued_before_revocation(user_id: str, issued_at: int | None) -> bool:
    try:
        value = await (await get_redis()).get(_VALID_AFTER + str(user_id))
    except Exception as e:  # noqa: BLE001
        logger.warning("revoke_all_check_failed", error=str(e))
        return False
    if not value:
        return False
    # Tokens without iat predate this mechanism: treat them as old.
    return issued_at is None or int(issued_at) < int(float(value))


async def token_is_usable(payload: dict) -> bool:
    """Not individually revoked, and not issued before a "log out everywhere"."""
    if await revoked_at(payload.get("jti")) is not None:
        return False
    return not await issued_before_revocation(payload["sub"], payload.get("iat"))


async def user_id_from_token(token: str | None, allowed_types: tuple[str, ...] = ("access",)) -> str | None:
    """Subject of a valid, non-revoked token (WebSockets, rate limiting)."""
    from app.core.security import decode_token

    payload = decode_token(token, allowed_types) if token else None
    if payload is None or not await token_is_usable(payload):
        return None
    return payload["sub"]
