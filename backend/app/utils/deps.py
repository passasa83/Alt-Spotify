from collections.abc import AsyncGenerator
from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User, UserRole

logger = structlog.get_logger("app")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def _resolve_user(token: str, db: AsyncSession, request: Request = None) -> User:
    user_id = verify_token(token, token_type="access")
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
    token = token_from_header or token_from_query
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _resolve_user(token, db, request)


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


async def require_owner(
    resource_owner_id: UUID,
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.ADMIN and current_user.id != resource_owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return current_user
