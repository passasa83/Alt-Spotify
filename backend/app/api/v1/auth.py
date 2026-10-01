
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.core.validation import validate_password
from app.models.admin_invite import AdminInviteToken
from app.models.user import User, UserRole
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserResponse
from app.utils.deps import get_current_user

logger = structlog.get_logger("app")

router = APIRouter(prefix="/auth", tags=["auth"])


async def _claim_invite(db: AsyncSession, token: str | None, email: str) -> AdminInviteToken:
    """Return the invite matching ``token`` if it can still be used by ``email``."""
    invalid = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired invitation")
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="An invitation is required to register")

    result = await db.execute(
        select(AdminInviteToken).where(AdminInviteToken.token == token).with_for_update()
    )
    invite = result.scalar_one_or_none()
    if invite is None or invite.is_revoked or invite.use_count >= invite.max_uses:
        raise invalid
    if invite.expires_at is not None:
        expires_at = invite.expires_at.replace(tzinfo=None)
        if expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            raise invalid
    if invite.email and invite.email.lower() != email.lower():
        raise invalid
    return invite


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"

    # Bootstrap: the first account is the admin and needs no invitation.
    # Checked before the conflicts so uninvited visitors can't probe which emails exist.
    is_first_user = (await db.execute(select(func.count()).select_from(User))).scalar_one() == 0
    invite = None
    if not is_first_user and not settings.OPEN_REGISTRATION:
        invite = await _claim_invite(db, body.invite_token, body.email)

    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        logger.warning("register_email_conflict", email=body.email, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    result = await db.execute(select(User).where(User.pseudo == body.pseudo))
    if result.scalar_one_or_none():
        logger.warning("register_pseudo_conflict", pseudo=body.pseudo, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pseudo already taken")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        pseudo=body.pseudo,
        role=UserRole.ADMIN if is_first_user else UserRole.USER,
    )
    db.add(user)
    await db.flush()

    if invite is not None:
        invite.use_count += 1
        invite.used_by = user.id

    from app.utils.favorites import ensure_liked_playlist
    await ensure_liked_playlist(db, user.id)

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

    from app.utils.favorites import ensure_liked_playlist
    await ensure_liked_playlist(db, user.id)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


class RefreshBody(BaseModel):
    refresh_token: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshBody, db: AsyncSession = Depends(get_db)):
    user_id = verify_token(body.refresh_token, token_type="refresh")
    if user_id is None:
        logger.warning("refresh_token_invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        logger.warning("refresh_user_not_found", user_id=user_id, active=user.is_active if user else False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    logger.info("refresh_token_success", user_id=str(user.id))
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/change-password")
async def change_password(
    body: ChangePasswordBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        logger.warning("change_password_wrong_current", user_id=str(current_user.id))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    valid, reason = validate_password(body.new_password)
    if not valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)
    if verify_password(body.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current one",
        )

    current_user.hashed_password = hash_password(body.new_password)
    await db.flush()
    logger.info("password_changed", user_id=str(current_user.id))
    return {"message": "Password updated"}



