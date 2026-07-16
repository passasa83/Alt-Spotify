import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.services.stats import (
    get_total_listening_time,
    get_monthly_stats,
    get_user_top_artists,
    get_user_top_tracks,
    get_genre_distribution,
    get_listening_by_hour,
    get_listening_streak,
)
from app.utils.deps import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.pseudo is not None:
        result = await db.execute(select(User).where(User.pseudo == body.pseudo, User.id != current_user.id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pseudo already taken")
        current_user.pseudo = body.pseudo
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.bio is not None:
        current_user.bio = body.bio
    if body.country is not None:
        current_user.country = body.country.upper() if body.country else None
    if body.is_child_account is not None:
        current_user.is_child_account = body.is_child_account
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.get("/me/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    top_tracks = await get_user_top_tracks(current_user.id, db)
    top_artists = await get_user_top_artists(current_user.id, db)
    total_time = await get_total_listening_time(current_user.id, db)
    monthly = await get_monthly_stats(current_user.id, db)
    genre_dist = await get_genre_distribution(current_user.id, db)
    hourly_dist = await get_listening_by_hour(current_user.id, db)
    streak = await get_listening_streak(current_user.id, db)

    total_plays = sum(t["play_count"] for t in top_tracks)

    return {
        "total_plays": total_plays,
        "total_minutes": total_time // 60,
        "top_tracks": [
            {
                "id": str(t["track"].id),
                "title": t["track"].title,
                "cover_url": t["track"].cover_url,
                "duration_seconds": t["track"].duration_seconds,
                "play_count": t["play_count"],
                "artist": {
                    "id": str(t["track"].artist.id),
                    "name": t["track"].artist.name,
                } if t["track"].artist else None,
            }
            for t in top_tracks
        ],
        "top_artists": [
            {
                "id": str(a["artist"].id),
                "name": a["artist"].name,
                "image_url": a["artist"].image_url,
                "play_count": a["play_count"],
            }
            for a in top_artists
        ],
        "monthly": monthly,
        "genre_distribution": [
            {"genre": g["genre"], "count": g["play_count"]}
            for g in genre_dist
        ],
        "listening_by_hour": [h["play_count"] for h in hourly_dist],
        "streak": streak.get("current_streak", 0),
    }


@router.get("/me/wrapped/{year}")
async def get_wrapped(
    year: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.stats import get_annual_wrapped
    return await get_annual_wrapped(current_user.id, year, db)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
