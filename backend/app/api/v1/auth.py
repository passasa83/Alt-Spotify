
import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_media_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.sessions import (
    issued_before_revocation,
    revoke_all_for_user,
    revoke_token,
    revoked_at,
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


_FAILED_LOGINS = "auth:failed:"
# Grace for the same refresh token used twice in a row: two tabs refreshing at
# once is not theft.
_REFRESH_REUSE_GRACE_SECONDS = 30


async def _failed_logins(email: str) -> int:
    try:
        return int(await (await get_redis()).get(_FAILED_LOGINS + email.lower()) or 0)
    except Exception:  # noqa: BLE001 - no Redis, no lockout
        return 0


async def _record_failed_login(email: str) -> None:
    try:
        r = await get_redis()
        key = _FAILED_LOGINS + email.lower()
        await r.incr(key)
        await r.expire(key, settings.LOGIN_LOCKOUT_MINUTES * 60)
    except Exception:  # noqa: BLE001
        pass


async def _clear_failed_logins(email: str) -> None:
    try:
        await (await get_redis()).delete(_FAILED_LOGINS + email.lower())
    except Exception:  # noqa: BLE001
        pass


def _issue_tokens(user_id: str) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(user_id), refresh_token=create_refresh_token(user_id))


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    # Per-account lockout: the per-IP rate limit alone lets an attacker with
    # many IPs keep guessing one account's password.
    if await _failed_logins(body.email) >= settings.LOGIN_MAX_FAILURES:
        logger.warning("login_locked", email=body.email, ip=client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {settings.LOGIN_LOCKOUT_MINUTES} minutes.",
        )
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        await _record_failed_login(body.email)
        logger.warning("login_failed", email=body.email, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        logger.warning("login_inactive", email=body.email, ip=client_ip)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    await _clear_failed_logins(body.email)
    logger.info("login_success", user_id=str(user.id), ip=client_ip)

    from app.utils.favorites import ensure_liked_playlist
    await ensure_liked_playlist(db, user.id)

    return _issue_tokens(str(user.id))


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
    payload = decode_token(body.refresh_token, ("refresh",))
    if payload is None:
        logger.warning("refresh_token_invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = payload["sub"]

    # Rotation: each refresh token works once. Seeing a used one again means
    # someone else holds a copy, unless it is a near-simultaneous retry.
    used_at = await revoked_at(payload.get("jti"))
    if used_at is not None:
        if time.time() - used_at > _REFRESH_REUSE_GRACE_SECONDS:
            logger.warning("refresh_token_reuse_detected", user_id=user_id)
            await revoke_all_for_user(user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token already used")
    if await issued_before_revocation(user_id, payload.get("iat")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        logger.warning("refresh_user_not_found", user_id=user_id, active=user.is_active if user else False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    await revoke_token(payload.get("jti"), payload.get("exp"))
    logger.info("refresh_token_success", user_id=str(user.id))
    return _issue_tokens(str(user.id))


class LogoutBody(BaseModel):
    refresh_token: str | None = None


@router.post("/logout")
async def logout(body: LogoutBody | None = None, request: Request = None):
    """Revoke this session's tokens (the access token from the header, and
    the refresh token if sent). Works even with an expired access token."""
    auth = request.headers.get("authorization", "") if request else ""
    tokens = [auth[7:]] if auth.lower().startswith("bearer ") else []
    if body and body.refresh_token:
        tokens.append(body.refresh_token)
    for token in tokens:
        payload = decode_token(token, ("access", "refresh"))
        if payload:
            await revoke_token(payload.get("jti"), payload.get("exp"))
    return {"message": "Logged out"}


@router.post("/logout-all")
async def logout_all(current_user: User = Depends(get_current_user)):
    """Sign out every device, this one included."""
    await revoke_all_for_user(str(current_user.id))
    logger.info("logout_all", user_id=str(current_user.id))
    return {"message": "All sessions revoked"}


@router.get("/media-token")
async def media_token(current_user: User = Depends(get_current_user)):
    """Short-lived token for media URLs (streams, covers): no other API access."""
    return {
        "media_token": create_media_token(str(current_user.id)),
        "expires_in": settings.MEDIA_TOKEN_EXPIRE_MINUTES * 60,
    }


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
    # A stolen session must not survive a password change: revoke them all
    # and hand this device fresh tokens.
    await revoke_all_for_user(str(current_user.id))
    logger.info("password_changed", user_id=str(current_user.id))
    tokens = _issue_tokens(str(current_user.id))
    return {"message": "Password updated", **tokens.model_dump()}



