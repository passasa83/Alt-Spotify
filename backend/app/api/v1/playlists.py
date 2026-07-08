import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.schemas.playlist import (
    PlaylistCreate,
    PlaylistUpdate,
    PlaylistResponse,
    PlaylistTrackAdd,
    PlaylistTrackReorder,
)
from app.schemas.track import TrackResponse
from app.schemas.common import PaginatedResponse
from app.utils.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.get("", response_model=PaginatedResponse[PlaylistResponse])
async def list_playlists(
    q: str | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Playlist).where(
        (Playlist.is_public == True) | (Playlist.owner_id == current_user.id)
    )
    count_query = select(func.count(Playlist.id)).where(
        (Playlist.is_public == True) | (Playlist.owner_id == current_user.id)
    )
    if q:
        query = query.where(Playlist.title.ilike(f"%{q}%"))
        count_query = count_query.where(Playlist.title.ilike(f"%{q}%"))
    if owner_id:
        query = query.where(Playlist.owner_id == owner_id)
        count_query = count_query.where(Playlist.owner_id == owner_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size).order_by(Playlist.created_at.desc())
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, page_size=page_size, pages=ceil(total / page_size) if total else 0
    )


@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


@router.get("/{playlist_id}/tracks", response_model=list[TrackResponse])
async def get_playlist_tracks(playlist_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Track)
        .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    return list(result.scalars().all())


@router.post("", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    body: PlaylistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = Playlist(**body.model_dump(), owner_id=current_user.id)
    db.add(playlist)
    await db.flush()
    await db.refresh(playlist)
    return playlist


@router.put("/{playlist_id}", response_model=PlaylistResponse)
async def update_playlist(
    playlist_id: uuid.UUID,
    body: PlaylistUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(playlist, field, value)
    await db.flush()
    await db.refresh(playlist)
    return playlist


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    await db.delete(playlist)


@router.post("/{playlist_id}/tracks", status_code=status.HTTP_201_CREATED)
async def add_track_to_playlist(
    playlist_id: uuid.UUID,
    body: PlaylistTrackAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id and not playlist.is_collaborative:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    track_result = await db.execute(select(Track).where(Track.id == body.track_id))
    if not track_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    existing = await db.execute(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == body.track_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Track already in playlist")

    if body.position is not None:
        position = body.position
    else:
        max_pos = await db.execute(
            select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == playlist_id)
        )
        position = (max_pos.scalar() or 0) + 1

    pt = PlaylistTrack(
        playlist_id=playlist_id,
        track_id=body.track_id,
        position=position,
        added_by=current_user.id,
    )
    db.add(pt)
    await db.flush()
    return {"message": "Track added"}


@router.delete("/{playlist_id}/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_track_from_playlist(
    playlist_id: uuid.UUID,
    track_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == track_id,
        )
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not in playlist")
    await db.delete(pt)


@router.put("/{playlist_id}/reorder")
async def reorder_playlist(
    playlist_id: uuid.UUID,
    body: list[PlaylistTrackReorder],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    for item in body:
        await db.execute(
            update(PlaylistTrack)
            .where(
                PlaylistTrack.playlist_id == playlist_id,
                PlaylistTrack.track_id == item.track_id,
            )
            .values(position=item.new_position)
        )
    await db.flush()
    return {"message": "Playlist reordered"}
