import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.favorite import Favorite
from app.models.track import Track
from app.models.album import Album
from app.models.artist import Artist
from app.models.podcast import Podcast
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_favorite(
    entity_type: str,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    valid_types = {"track", "album", "artist", "podcast"}
    if entity_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Use: {valid_types}")

    existing = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.entity_id == entity_id,
            Favorite.entity_type == entity_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already favorited")

    fav = Favorite(
        user_id=current_user.id,
        entity_id=entity_id,
        entity_type=entity_type,
    )
    db.add(fav)
    await db.flush()
    return {"message": "Added to favorites"}


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    entity_type: str,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.entity_id == entity_id,
            Favorite.entity_type == entity_type,
        ).delete()
    )
    await db.flush()


@router.get("/check")
async def check_favorite(
    entity_type: str,
    entity_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.entity_id == entity_id,
            Favorite.entity_type == entity_type,
        )
    )
    return {"is_favorited": result.scalar_one_or_none() is not None}


@router.get("")
async def list_favorites(
    entity_type: str = Query("track"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(
        select(func.count(Favorite.id)).where(
            Favorite.user_id == current_user.id,
            Favorite.entity_type == entity_type,
        )
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Favorite)
        .where(Favorite.user_id == current_user.id, Favorite.entity_type == entity_type)
        .order_by(Favorite.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    favorites = result.scalars().all()

    entity_ids = [f.entity_id for f in favorites]
    entities = []

    if entity_ids and entity_type == "track":
        res = await db.execute(select(Track).where(Track.id.in_(entity_ids)))
        entities = res.scalars().all()
    elif entity_ids and entity_type == "album":
        res = await db.execute(select(Album).where(Album.id.in_(entity_ids)))
        entities = res.scalars().all()
    elif entity_ids and entity_type == "artist":
        res = await db.execute(select(Artist).where(Artist.id.in_(entity_ids)))
        entities = res.scalars().all()
    elif entity_ids and entity_type == "podcast":
        res = await db.execute(select(Podcast).where(Podcast.id.in_(entity_ids)))
        entities = res.scalars().all()

    from math import ceil
    return {
        "items": entities,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }
