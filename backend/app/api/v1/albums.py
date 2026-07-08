import uuid
from datetime import date
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.album import Album
from app.models.track import Track
from app.schemas.album import AlbumCreate, AlbumUpdate, AlbumResponse
from app.schemas.track import TrackResponse
from app.schemas.common import PaginatedResponse
from app.utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/albums", tags=["albums"])


@router.get("", response_model=PaginatedResponse[AlbumResponse])
async def list_albums(
    q: str | None = None,
    artist_id: uuid.UUID | None = None,
    release_after: date | None = None,
    release_before: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Album)
    count_query = select(func.count(Album.id))
    if q:
        query = query.where(Album.title.ilike(f"%{q}%"))
        count_query = count_query.where(Album.title.ilike(f"%{q}%"))
    if artist_id:
        query = query.where(Album.artist_id == artist_id)
        count_query = count_query.where(Album.artist_id == artist_id)
    if release_after:
        query = query.where(Album.release_date >= release_after)
        count_query = count_query.where(Album.release_date >= release_after)
    if release_before:
        query = query.where(Album.release_date <= release_before)
        count_query = count_query.where(Album.release_date <= release_before)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size).order_by(Album.created_at.desc())
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, page_size=page_size, pages=ceil(total / page_size) if total else 0
    )


@router.get("/{album_id}", response_model=AlbumResponse)
async def get_album(album_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Album).where(Album.id == album_id))
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    return album


@router.get("/{album_id}/tracks", response_model=list[TrackResponse])
async def get_album_tracks(album_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.album_id == album_id).order_by(Track.created_at))
    return list(result.scalars().all())


@router.post("", response_model=AlbumResponse, status_code=status.HTTP_201_CREATED)
async def create_album(
    body: AlbumCreate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    album = Album(**body.model_dump())
    db.add(album)
    await db.flush()
    await db.refresh(album)
    return album


@router.put("/{album_id}", response_model=AlbumResponse)
async def update_album(
    album_id: uuid.UUID,
    body: AlbumUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Album).where(Album.id == album_id))
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(album, field, value)
    await db.flush()
    await db.refresh(album)
    return album


@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_album(
    album_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Album).where(Album.id == album_id))
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    await db.delete(album)
