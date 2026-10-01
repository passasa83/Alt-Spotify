import uuid
from datetime import datetime, timezone
from math import ceil
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.stream import stream_track_file
from app.core.database import get_db
from app.core.metrics import TRACKS_PLAYED_TOTAL
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
    local_only: bool = False,
    # True: only tracks with audio; False: only tracks without (catalogue cleanup).
    playable: bool | None = None,
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

    if local_only:
        local_filter = Track.file_url.like("local:%")
        query = query.where(local_filter)
        count_query = count_query.where(local_filter)
    if playable is not None:
        has_audio = or_(Track.file_url.isnot(None), Track.hls_path.isnot(None))
        audio_filter = has_audio if playable else ~has_audio
        query = query.where(audio_filter)
        count_query = count_query.where(audio_filter)

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


class PlayBody(BaseModel):
    # Seconds actually listened (seeks excluded); capped to a day.
    duration_listened_seconds: int = Field(0, ge=0, le=86_400)


@router.post("/{track_id}/play")
async def play_track(
    track_id: uuid.UUID,
    body: PlayBody | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_track_for_user(track_id, current_user, db)

    await db.execute(update(Track).where(Track.id == track_id).values(play_count=Track.play_count + 1))
    TRACKS_PLAYED_TOTAL.inc()

    logger.info("track_played", track_id=str(track_id), user_id=str(current_user.id))

    history = ListeningHistory(
        user_id=current_user.id,
        track_id=track_id,
        played_at=datetime.now(timezone.utc).replace(tzinfo=None),
        duration_listened_seconds=body.duration_listened_seconds if body else 0,
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
    return stream_track_file(request, track.file_url)


@router.post("/{track_id}/download")
async def download_track(
    track_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(get_current_user_stream),
    db: AsyncSession = Depends(get_db),
):
    track = await get_track_for_user(track_id, current_user, db)

    if not track.file_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No audio file available")

    device_id = body.get("device_id", "default")
    download_url = generate_download_url(track_id, str(current_user.id), device_id)
    return {"download_url": download_url}


@router.post("/{track_id}/fetch-youtube")
async def fetch_from_youtube(
    track_id: uuid.UUID,
    body: dict | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Track)
        .options(selectinload(Track.artist))
        .where(Track.id == track_id)
    )
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    if track.file_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Track already has audio")

    from app.services.yt_dlp_download import search_and_download
    artist_name = track.artist.name if track.artist else ""
    youtube_url = (body or {}).get("youtube_url")

    download_result = await search_and_download(
        title=track.title,
        artist=artist_name,
        track_id=str(track_id),
        youtube_url=youtube_url,
    )

    if not download_result["success"]:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=download_result.get("error", "Download failed"),
        )

    track.file_url = download_result["file_url"]
    if not track.duration_seconds and download_result.get("youtube_duration"):
        track.duration_seconds = download_result["youtube_duration"]

    if not track.cover_url:
        from app.services.cover_service import fetch_cover
        api_cover = await fetch_cover(track.title, artist_name)
        if api_cover:
            track.cover_url = api_cover

    await db.commit()

    return {
        "track_id": str(track.id),
        "file_url": track.file_url,
        "cover_url": track.cover_url,
        "youtube_url": download_result.get("youtube_url"),
        "youtube_title": download_result.get("youtube_title"),
        "message": "Downloaded and linked successfully",
    }


@router.post("/fetch-url")
async def fetch_from_youtube_url(
    youtube_url: str,
    title: str = "",
    artist: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.yt_dlp_download import download_from_url

    download_result = await download_from_url(youtube_url)

    if not download_result["success"]:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=download_result.get("error", "Download failed"),
        )

    artist_name = artist or download_result.get("metadata", {}).get("artist", "")
    track_title = title or download_result.get("metadata", {}).get("title", "") or download_result.get("youtube_title", "Unknown")

    from app.utils.artist import ensure_artist
    artist_id = await ensure_artist(db, artist_name or "Unknown", None)

    track = Track(
        title=track_title,
        artist_id=artist_id,
        file_url=download_result["file_url"],
        duration_seconds=download_result.get("youtube_duration") or download_result.get("metadata", {}).get("duration", 0),
    )
    db.add(track)
    await db.flush()
    await db.refresh(track)

    return {
        "track_id": str(track.id),
        "title": track.title,
        "artist": artist_name,
        "file_url": track.file_url,
        "youtube_url": youtube_url,
        "message": "Downloaded and imported successfully",
    }
