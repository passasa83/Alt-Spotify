import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.track import Track
from app.models.user import User
from app.services.recommendation import (
    generate_daily_mix,
    get_autoplay_tracks,
    get_personalized_recommendations,
    get_radio_tracks,
    get_similar_tracks,
)
from app.utils.deps import get_current_user
from app.utils.track_serializer import serialize_track

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


async def _full_tracks(db: AsyncSession, track_ids: list) -> list[dict]:
    """Playable, fully serialized tracks (artist, album, file...), in order.

    The recommendation services return bare rows; the clients need the same
    shape as everywhere else to display and play them. ``track_id`` is kept
    for older clients.
    """
    ids = [uuid.UUID(str(i)) for i in track_ids]
    if not ids:
        return []
    result = await db.execute(
        select(Track).options(selectinload(Track.artist), selectinload(Track.album)).where(Track.id.in_(ids))
    )
    by_id = {uuid.UUID(str(t.id)): t for t in result.scalars().all()}
    out = []
    for i in ids:
        track = by_id.get(i)
        if track and (track.file_url or track.hls_path):
            out.append({**serialize_track(track), "track_id": str(track.id)})
    return out


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
        "tracks": await _full_tracks(db, [t.id for t in tracks]),
    }


@router.get("/daily-mix")
async def daily_mix(
    mix_count: int = Query(6, ge=1, le=10),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mixes = await generate_daily_mix(current_user.id, db, mix_count=mix_count)
    for mix in mixes:
        mix["tracks"] = await _full_tracks(db, [t["track_id"] for t in mix["tracks"]])
        mix["track_count"] = len(mix["tracks"])
    return {"mixes": [m for m in mixes if m["tracks"]]}


@router.get("/radio/{track_id}")
async def radio(
    track_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    tracks = await get_radio_tracks(track_id, db, limit=limit)
    return {"title": "Radio", "tracks": await _full_tracks(db, [t.id for t in tracks])}


@router.get("/similar/{track_id}")
async def similar_tracks(
    track_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    tracks = await get_similar_tracks(track_id, db, limit=limit)
    return {"tracks": await _full_tracks(db, [t.id for t in tracks])}


@router.get("/autoplay/{track_id}")
async def autoplay(
    track_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=30),
    exclude: str | None = Query(None, description="Comma-separated track ids to skip (recently played)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full, playable tracks queued by the player once the queue runs out."""
    excluded: set[uuid.UUID] = set()
    for raw in (exclude or "").split(","):
        try:
            excluded.add(uuid.UUID(raw.strip()))
        except ValueError:
            continue
    tracks = await get_autoplay_tracks(track_id, current_user, db, exclude=excluded, limit=limit)
    return {"tracks": [serialize_track(t) for t in tracks]}
