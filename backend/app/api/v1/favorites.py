import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.favorite import Favorite
from app.models.track import Track
from app.models.album import Album
from app.models.artist import Artist
from app.models.podcast import Podcast
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.user import User
from app.utils.deps import get_current_user
from app.utils.track_serializer import serialize_track

router = APIRouter(prefix="/favorites", tags=["favorites"])

LIKED_SONGS_TITLE = "Liked Songs"


async def get_or_create_liked_playlist(user_id: uuid.UUID, db: AsyncSession) -> Playlist:
    result = await db.execute(
        select(Playlist).where(
            Playlist.owner_id == user_id,
            Playlist.title == LIKED_SONGS_TITLE,
        )
    )
    playlist = result.scalar_one_or_none()
    if not playlist:
        playlist = Playlist(
            title=LIKED_SONGS_TITLE,
            owner_id=user_id,
            description="Your liked songs",
            is_public=False,
        )
        db.add(playlist)
        await db.flush()
        await db.refresh(playlist)
    return playlist


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

    if entity_type == "track":
        playlist = await get_or_create_liked_playlist(current_user.id, db)
        existing_pt = await db.execute(
            select(PlaylistTrack).where(
                PlaylistTrack.playlist_id == playlist.id,
                PlaylistTrack.track_id == entity_id,
            )
        )
        if not existing_pt.scalar_one_or_none():
            max_pos = await db.execute(
                select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == playlist.id)
            )
            position = (max_pos.scalar() or 0) + 1
            pt = PlaylistTrack(
                playlist_id=playlist.id,
                track_id=entity_id,
                position=position,
                added_by=current_user.id,
            )
            db.add(pt)

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

    if entity_type == "track":
        result = await db.execute(
            select(Playlist).where(
                Playlist.owner_id == current_user.id,
                Playlist.title == LIKED_SONGS_TITLE,
            )
        )
        playlist = result.scalar_one_or_none()
        if playlist:
            await db.execute(
                select(PlaylistTrack).where(
                    PlaylistTrack.playlist_id == playlist.id,
                    PlaylistTrack.track_id == entity_id,
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
        res = await db.execute(
            select(Track)
            .options(selectinload(Track.artist), selectinload(Track.album))
            .where(Track.id.in_(entity_ids))
        )
        tracks = {str(t.id): t for t in res.scalars().all()}
        for fav in favorites:
            track = tracks.get(str(fav.entity_id))
            if track:
                entities.append(serialize_track(track))
    elif entity_ids and entity_type == "album":
        res = await db.execute(select(Album).where(Album.id.in_(entity_ids)))
        entities = [{"id": str(a.id), "title": a.title, "cover_url": a.cover_url} for a in res.scalars().all()]
    elif entity_ids and entity_type == "artist":
        res = await db.execute(select(Artist).where(Artist.id.in_(entity_ids)))
        entities = [{"id": str(a.id), "name": a.name, "image_url": a.image_url} for a in res.scalars().all()]
    elif entity_ids and entity_type == "podcast":
        res = await db.execute(select(Podcast).where(Podcast.id.in_(entity_ids)))
        entities = [{"id": str(p.id), "title": p.title, "cover_url": p.cover_url} for p in res.scalars().all()]

    return {
        "items": entities,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }
