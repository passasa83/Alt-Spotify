import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.artist import Artist
from app.schemas.artist import ArtistCreate, ArtistUpdate, ArtistResponse
from app.schemas.common import PaginatedResponse
from app.utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get("", response_model=PaginatedResponse[ArtistResponse])
async def list_artists(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Artist)
    count_query = select(func.count(Artist.id))
    if q:
        query = query.where(Artist.name.ilike(f"%{q}%"))
        count_query = count_query.where(Artist.name.ilike(f"%{q}%"))

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size).order_by(Artist.name)
    )
    items = result.scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, page_size=page_size, pages=ceil(total / page_size) if total else 0
    )


@router.get("/{artist_id}", response_model=ArtistResponse)
async def get_artist(artist_id: str, db: AsyncSession = Depends(get_db)):
    try:
        artist_uuid = uuid.UUID(artist_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    result = await db.execute(select(Artist).where(Artist.id == artist_uuid))
    artist = result.scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return artist


@router.post("", response_model=ArtistResponse, status_code=status.HTTP_201_CREATED)
async def create_artist(
    body: ArtistCreate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    artist = Artist(**body.model_dump())
    db.add(artist)
    await db.flush()
    await db.refresh(artist)
    return artist


@router.put("/{artist_id}", response_model=ArtistResponse)
async def update_artist(
    artist_id: uuid.UUID,
    body: ArtistUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Artist).where(Artist.id == artist_id))
    artist = result.scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(artist, field, value)
    await db.flush()
    await db.refresh(artist)
    return artist


@router.delete("/{artist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artist(
    artist_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    result = await db.execute(select(Artist).where(Artist.id == artist_id))
    artist = result.scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    await db.delete(artist)
