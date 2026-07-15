from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.services.recommendation import (
    get_personalized_recommendations,
    get_radio_tracks,
    get_similar_tracks,
    generate_daily_mix,
)
from app.utils.deps import get_current_user

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/discover")
async def discover_weekly(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tracks = await get_personalized_recommendations(current_user.id, db, limit=limit)
    return {
        "title": "Discover Weekly",
        "description": "New tracks picked for you based on your listening habits",
        "tracks": [
            {
                "track_id": str(t.id),
                "title": t.title,
                "artist_id": str(t.artist_id),
                "album_id": str(t.album_id) if t.album_id else None,
                "genre": t.genre,
                "duration_seconds": t.duration_seconds,
            }
            for t in tracks
        ],
    }


@router.get("/daily-mix")
async def daily_mix(
    mix_count: int = Query(6, ge=1, le=10),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mixes = await generate_daily_mix(current_user.id, db, mix_count=mix_count)
    return {"mixes": mixes}


@router.get("/radio/{track_id}")
async def radio(
    track_id: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    tracks = await get_radio_tracks(uuid.UUID(track_id), db, limit=limit)
    return {
        "title": "Radio",
        "tracks": [
            {
                "track_id": str(t.id),
                "title": t.title,
                "artist_id": str(t.artist_id),
                "genre": t.genre,
                "duration_seconds": t.duration_seconds,
            }
            for t in tracks
        ],
    }


@router.get("/similar/{track_id}")
async def similar_tracks(
    track_id: str,
    limit: int = Query(10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    tracks = await get_similar_tracks(uuid.UUID(track_id), db, limit=limit)
    return {
        "tracks": [
            {
                "track_id": str(t.id),
                "title": t.title,
                "artist_id": str(t.artist_id),
                "genre": t.genre,
                "duration_seconds": t.duration_seconds,
            }
            for t in tracks
        ],
    }
