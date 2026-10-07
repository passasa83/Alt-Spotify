from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.sessions import token_is_usable
from app.models.user import User, UserRole

logger = structlog.get_logger("app")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def _resolve_user(
    token: str, db: AsyncSession, request: Request = None, allowed_types: tuple[str, ...] = ("access",)
) -> User:
    payload = decode_token(token, allowed_types)
    # Revoked one by one (logout) or all at once (password change, account
    # disabled, stolen refresh token) despite a valid signature.
    if payload is not None and not await token_is_usable(payload):
        payload = None
    user_id = payload["sub"] if payload else None
    if user_id is None:
        client_ip = request.client.host if request and request.client else "unknown"
        logger.warning("auth_token_invalid", ip=client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        logger.warning("auth_user_not_found", user_id=user_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_active:
        logger.warning("auth_user_inactive", user_id=user_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
) -> User:
    return await _resolve_user(token, db, request)


async def get_current_user_from_header_or_query(
    token_from_header: str | None = Depends(OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)),
    token_from_query: str | None = Query(None, alias="token"),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
) -> User:
    if token_from_header:
        # Media players (HLS.js) send the token in the header: like the query
        # form, both the access and the restricted media token open these
        # media-only endpoints — nothing else.
        return await _resolve_user(token_from_header, db, request, ("access", "media"))
    if not token_from_query:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # URLs (<audio src>, <img src>) carry the restricted media token; the
    # access token is still accepted there for older clients.
    return await _resolve_user(token_from_query, db, request, allowed_types=("access", "media"))


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


# Media elements (<audio>, HLS.js without custom headers) can't send an
# Authorization header, so streaming endpoints also accept ``?token=``.
get_current_user_stream = get_current_user_from_header_or_query


async def require_owner(
    resource_owner_id: UUID,
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.ADMIN and current_user.id != resource_owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return current_user
