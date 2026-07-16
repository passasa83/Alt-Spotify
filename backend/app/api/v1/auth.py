from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.models.admin_invite import AdminInviteToken
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.utils.deps import get_current_user

logger = structlog.get_logger("app")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    request: Request,
    invite_token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"

    if invite_token:
        result = await db.execute(
            select(AdminInviteToken).where(AdminInviteToken.token == invite_token)
        )
        invite = result.scalar_one_or_none()
        if not invite or invite.is_revoked:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invitation token")
        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation token expired")
        if invite.use_count >= invite.max_uses:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation token already used")
        if invite.email and invite.email.lower() != body.email.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation not valid for this email")

    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    result = await db.execute(select(User).where(User.pseudo == body.pseudo))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pseudo already taken")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        pseudo=body.pseudo,
    )
    db.add(user)
    await db.flush()

    if invite_token:
        invite.use_count += 1
        invite.used_by = user.id

    await db.refresh(user)
    logger.info("user_registered", user_id=str(user.id), ip=client_ip)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        logger.warning("login_failed", email=body.email, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        logger.warning("login_inactive", email=body.email, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    logger.info("login_success", user_id=str(user.id), ip=client_ip)
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(token: str, db: AsyncSession = Depends(get_db)):
    user_id = verify_token(token, token_type="refresh")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
