import uuid
from datetime import datetime, timezone
from math import ceil
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import String, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.stream import stream_object_response
from app.core.database import get_db
from app.models.listening_history import ListeningHistory
from app.models.track import Track
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.services.offline import generate_download_url
from app.utils.deps import get_current_user, get_current_user_stream, require_admin
from app.utils.track_access import get_track_for_user
from app.utils.track_serializer import serialize_track

logger = structlog.get_logger("app")

router = APIRouter(prefix="/tracks", tags=["tracks"])


async def _reload_track(track_id: uuid.UUID, db: AsyncSession) -> Track:
    """Reload a track with its relations eagerly loaded.

    ``TrackResponse`` embeds ``artist``/``album``, which would otherwise trigger
    a lazy load outside of the async greenlet context.
    """
    result = await db.execute(
        select(Track)
        .options(selectinload(Track.artist), selectinload(Track.album))
        .where(Track.id == track_id)
        # The track is usually already in the identity map (just created or
        # updated), in which case eager loaders are skipped without this.
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


@router.get("", response_model=PaginatedResponse[TrackResponse])
async def list_tracks(
    q: str | None = None,
    artist_id: uuid.UUID | None = None,
    album_id: uuid.UUID | None = None,
    genre: str | None = None,
    min_duration: int | None = None,
    max_duration: int | None = None,
    min_bpm: float | None = None,
    max_bpm: float | None = None,
    key: str | None = None,
    mood: str | None = None,
    sort: Literal["created_at", "play_count", "title"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Track)
    count_query = select(func.count(Track.id))
    
    # Territory filter
    if current_user.country:
        territory_filter = (Track.allowed_territories.is_(None)) | (cast(Track.allowed_territories, String).contains(f'"{current_user.country}"'))
        query = query.where(territory_filter)
        count_query = count_query.where(territory_filter)
    
    # Explicit content filter
    if current_user.is_child_account:
        explicit_filter = Track.is_explicit == False
        query = query.where(explicit_filter)
        count_query = count_query.where(explicit_filter)

    if q:
        query = query.where(Track.title.ilike(f"%{q}%"))
        count_query = count_query.where(Track.title.ilike(f"%{q}%"))
    if artist_id:
        query = query.where(Track.artist_id == artist_id)
        count_query = count_query.where(Track.artist_id == artist_id)
    if album_id:
        query = query.where(Track.album_id == album_id)
        count_query = count_query.where(Track.album_id == album_id)
    if genre:
        query = query.where(Track.genre.ilike(genre))
        count_query = count_query.where(Track.genre.ilike(genre))
    if min_duration is not None:
        query = query.where(Track.duration_seconds >= min_duration)
        count_query = count_query.where(Track.duration_seconds >= min_duration)
    if max_duration is not None:
        query = query.where(Track.duration_seconds <= max_duration)
        count_query = count_query.where(Track.duration_seconds <= max_duration)
    if min_bpm is not None:
        query = query.where(Track.bpm >= min_bpm)
        count_query = count_query.where(Track.bpm >= min_bpm)
    if max_bpm is not None:
        query = query.where(Track.bpm <= max_bpm)
        count_query = count_query.where(Track.bpm <= max_bpm)
    if key:
        query = query.where(Track.key.ilike(key))
        count_query = count_query.where(Track.key.ilike(key))
    if mood:
        query = query.where(Track.mood.ilike(f"%{mood}%"))
        count_query = count_query.where(Track.mood.ilike(f"%{mood}%"))

    total = (await db.execute(count_query)).scalar() or 0
    sort_column = getattr(Track, sort)
    result = await db.execute(
        query.options(selectinload(Track.artist), selectinload(Track.album))
        .offset((page - 1) * page_size).limit(page_size)
        # Track.id as tie-breaker keeps pagination stable for equal values.
        .order_by(sort_column.asc() if order == "asc" else sort_column.desc(), Track.id)
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=[serialize_track(t) for t in items], total=total, page=page, page_size=page_size, pages=ceil(total / page_size) if total else 0
    )


@router.get("/{track_id}")
async def get_track(
    track_id: uuid.UUID, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = await get_track_for_user(track_id, current_user, db)
    return serialize_track(track)


@router.post("", response_model=TrackResponse, status_code=status.HTTP_201_CREATED)
async def create_track(
    body: TrackCreate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    track = Track(**body.model_dump())
    db.add(track)
    await db.flush()
    return serialize_track(await _reload_track(track.id, db))


@router.put("/{track_id}", response_model=TrackResponse)
async def update_track(
    track_id: uuid.UUID,
    body: TrackUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(track, field, value)
    await db.flush()
    return serialize_track(await _reload_track(track_id, db))


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_track(
    track_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    await db.delete(track)


@router.post("/{track_id}/play")
async def play_track(
    track_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_track_for_user(track_id, current_user, db)

    await db.execute(update(Track).where(Track.id == track_id).values(play_count=Track.play_count + 1))

    logger.info("track_played", track_id=str(track_id), user_id=str(current_user.id))

    history = ListeningHistory(
        user_id=current_user.id,
        track_id=track_id,
        played_at=datetime.now(timezone.utc).replace(tzinfo=None),
        duration_listened_seconds=0,
    )
    db.add(history)
    await db.flush()
    return {"message": "Play recorded"}


@router.get("/{track_id}/stream")
async def stream_track(
    track_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_stream),
):
    track = await get_track_for_user(track_id, current_user, db)

    if not track.file_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No audio file available")
    return stream_object_response(request, track.file_url)


@router.post("/{track_id}/download")
async def download_track(
    track_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    track = await get_track_for_user(track_id, current_user, db)

    if not track.file_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No audio file available")

    device_id = body.get("device_id", "default")
    download_url = generate_download_url(track_id, str(current_user.id), device_id)
    return {"download_url": download_url}
