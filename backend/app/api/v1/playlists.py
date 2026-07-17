import uuid
from math import ceil
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, update, delete, and_, extract
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.models.listening_history import ListeningHistory
from app.models.favorite import Favorite
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
from app.utils.track_serializer import serialize_track
from app.models.user import User

router = APIRouter(prefix="/playlists", tags=["playlists"])

LIKED_SONGS_TITLE = "Liked Songs"


async def ensure_liked_songs_playlist(user_id: uuid.UUID, db: AsyncSession) -> None:
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

    fav_result = await db.execute(
        select(Favorite.entity_id)
        .where(Favorite.user_id == user_id, Favorite.entity_type == "track")
        .order_by(Favorite.created_at.desc())
    )
    fav_track_ids = [row[0] for row in fav_result.all()]

    existing_result = await db.execute(
        select(PlaylistTrack.track_id).where(PlaylistTrack.playlist_id == playlist.id)
    )
    existing_ids = {row[0] for row in existing_result.all()}

    for track_id in fav_track_ids:
        if track_id not in existing_ids:
            max_pos = await db.execute(
                select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == playlist.id)
            )
            position = (max_pos.scalar() or 0) + 1
            db.add(PlaylistTrack(
                playlist_id=playlist.id,
                track_id=track_id,
                position=position,
                added_by=user_id,
            ))

    for track_id in existing_ids:
        if track_id not in set(fav_track_ids):
            await db.execute(
                select(PlaylistTrack).where(
                    PlaylistTrack.playlist_id == playlist.id,
                    PlaylistTrack.track_id == track_id,
                ).delete()
            )

    await db.flush()


@router.get("", response_model=PaginatedResponse[PlaylistResponse])
async def list_playlists(
    q: str | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_liked_songs_playlist(current_user.id, db)

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

    playlist_ids = [p.id for p in items]
    counts = {}
    if playlist_ids:
        count_res = await db.execute(
            select(PlaylistTrack.playlist_id, func.count(PlaylistTrack.id))
            .where(PlaylistTrack.playlist_id.in_(playlist_ids))
            .group_by(PlaylistTrack.playlist_id)
        )
        counts = {row[0]: row[1] for row in count_res.all()}

    items_with_count = []
    for p in items:
        item_dict = {
            "id": p.id,
            "title": p.title,
            "owner_id": p.owner_id,
            "description": p.description,
            "is_public": p.is_public,
            "is_collaborative": p.is_collaborative,
            "is_smart": getattr(p, "is_smart", False),
            "smart_rules": getattr(p, "smart_rules", None),
            "max_tracks": getattr(p, "max_tracks", 50),
            "auto_refresh": getattr(p, "auto_refresh", False),
            "last_refreshed_at": getattr(p, "last_refreshed_at", None),
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "track_count": counts.get(p.id, 0),
        }
        items_with_count.append(item_dict)

    return PaginatedResponse(
        items=items_with_count, total=total, page=page, page_size=page_size, pages=ceil(total / page_size) if total else 0
    )


# ──────────────────────────────────────────────
# P.2 — Complete Listening History
# ──────────────────────────────────────────────

@router.get("/user/history")
async def get_user_history(
    from_date: str | None = None,
    to_date: str | None = None,
    artist_id: uuid.UUID | None = None,
    genre: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ListeningHistory, Track)
        .join(Track, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == current_user.id)
    )

    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date)
            query = query.where(ListeningHistory.played_at >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date)
            query = query.where(ListeningHistory.played_at <= to_dt)
        except ValueError:
            pass
    if artist_id:
        query = query.where(Track.artist_id == artist_id)
    if genre:
        query = query.where(Track.genre.ilike(genre))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(ListeningHistory.played_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for lh, track in rows:
        items.append({
            "id": str(lh.id),
            "track_id": str(track.id),
            "title": track.title,
            "artist_id": str(track.artist_id),
            "cover_url": track.cover_url,
            "duration_seconds": track.duration_seconds,
            "played_at": lh.played_at.isoformat() if lh.played_at else None,
            "duration_listened_seconds": lh.duration_listened_seconds,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }


@router.get("/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return playlist


@router.get("/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistTrack)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .options(selectinload(PlaylistTrack.track).selectinload(Track.artist))
        .options(selectinload(PlaylistTrack.track).selectinload(Track.album))
        .order_by(PlaylistTrack.position)
    )
    pts = result.scalars().all()
    items = []
    for pt in pts:
        if pt.track:
            items.append({
                "id": pt.track_id,
                "playlist_id": str(pt.playlist_id),
                "track_id": str(pt.track_id),
                "position": pt.position,
                "added_by": str(pt.added_by) if pt.added_by else None,
                "added_at": pt.added_at.isoformat() if pt.added_at else None,
                "track": serialize_track(pt.track),
            })
    return items


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


# ──────────────────────────────────────────────
# P.1 — Smart Playlists
# ──────────────────────────────────────────────


class SmartPlaylistCreate(BaseModel):
    title: str
    rules: dict
    max_tracks: int = 50
    auto_refresh: bool = False


class SmartPlaylistRulesUpdate(BaseModel):
    rules: dict
    max_tracks: int = 50


@router.post("/smart", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_smart_playlist(
    body: SmartPlaylistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = Playlist(
        title=body.title,
        owner_id=current_user.id,
        is_smart=True,
        smart_rules=body.rules,
        max_tracks=body.max_tracks,
        auto_refresh=body.auto_refresh,
        is_public=False,
    )
    db.add(playlist)
    await db.flush()
    await db.refresh(playlist)

    from app.services.smart_playlist import evaluate_smart_playlist
    await evaluate_smart_playlist(playlist, db)
    await db.flush()
    await db.refresh(playlist)

    return playlist


@router.post("/{playlist_id}/refresh")
async def refresh_smart_playlist(
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
    if not playlist.is_smart:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a smart playlist")

    from app.services.smart_playlist import evaluate_smart_playlist
    count = await evaluate_smart_playlist(playlist, db)
    await db.flush()

    return {"message": f"Smart playlist refreshed with {count} tracks", "track_count": count}


@router.put("/{playlist_id}/rules")
async def update_smart_playlist_rules(
    playlist_id: uuid.UUID,
    body: SmartPlaylistRulesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if not playlist.is_smart:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a smart playlist")

    playlist.smart_rules = body.rules
    playlist.max_tracks = body.max_tracks

    from app.services.smart_playlist import evaluate_smart_playlist
    count = await evaluate_smart_playlist(playlist, db)
    await db.flush()
    await db.refresh(playlist)

    return playlist


# ──────────────────────────────────────────────
# P.3 — Top of Month/Year Playlists
# ──────────────────────────────────────────────

@router.post("/generate-top")
async def generate_top_playlist(
    period: str = Query(..., pattern="^(month|year)$"),
    year: int = Query(..., ge=2000, le=2100),
    month: int | None = Query(None, ge=1, le=12),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if period == "month" and month is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="month parameter required for period=month")

    if period == "month":
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        title = f"Top Songs — {start_date.strftime('%B %Y')}"
    else:
        start_date = datetime(year, 1, 1)
        end_date = datetime(year + 1, 1, 1)
        title = f"Top Songs — {year}"

    result = await db.execute(
        select(
            ListeningHistory.track_id,
            func.count(ListeningHistory.id).label("play_count"),
        )
        .where(
            ListeningHistory.user_id == current_user.id,
            ListeningHistory.played_at >= start_date,
            ListeningHistory.played_at < end_date,
        )
        .group_by(ListeningHistory.track_id)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(limit)
    )
    top_tracks = result.all()

    if not top_tracks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No listening data for this period")

    existing = await db.execute(
        select(Playlist).where(
            Playlist.owner_id == current_user.id,
            Playlist.title == title,
        )
    )
    playlist = existing.scalar_one_or_none()
    if not playlist:
        playlist = Playlist(
            title=title,
            owner_id=current_user.id,
            description=f"Auto-generated top songs for {title.split('—')[1].strip()}",
            is_public=False,
        )
        db.add(playlist)
        await db.flush()

    await db.execute(
        delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id)
    )

    for i, row in enumerate(top_tracks):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=row.track_id,
            position=i,
            added_by=current_user.id,
        )
        db.add(pt)

    await db.flush()
    await db.refresh(playlist)

    return {
        "playlist_id": str(playlist.id),
        "title": title,
        "track_count": len(top_tracks),
    }


# ──────────────────────────────────────────────
# P.4 — Duplicate Detection
# ──────────────────────────────────────────────

@router.get("/{playlist_id}/duplicates")
async def find_duplicates(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    result = await db.execute(
        select(PlaylistTrack, Track)
        .join(Track, PlaylistTrack.track_id == Track.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    rows = result.all()

    exact_groups: dict[str, list] = {}
    fuzzy_groups: dict[str, list] = {}

    for pt, track in rows:
        key = str(track.id)
        if key not in exact_groups:
            exact_groups[key] = []
        exact_groups[key].append({
            "track_id": str(track.id),
            "title": track.title,
            "artist_id": str(track.artist_id),
            "position": pt.position,
            "added_at": pt.added_at.isoformat() if pt.added_at else None,
        })

        fuzzy_key = f"{track.title.lower().strip()}|{str(track.artist_id)}"
        if fuzzy_key not in fuzzy_groups:
            fuzzy_groups[fuzzy_key] = []
        fuzzy_groups[fuzzy_key].append({
            "track_id": str(track.id),
            "title": track.title,
            "artist_id": str(track.artist_id),
            "position": pt.position,
        })

    exact_dupes = {k: v for k, v in exact_groups.items() if len(v) > 1}
    fuzzy_dupes = {k: v for k, v in fuzzy_groups.items() if len(v) > 1}

    return {
        "exact_duplicates": list(exact_dupes.values()),
        "fuzzy_duplicates": list(fuzzy_dupes.values()),
        "total_exact": sum(len(v) for v in exact_dupes.values()),
        "total_fuzzy": sum(len(v) for v in fuzzy_dupes.values()),
    }


@router.post("/{playlist_id}/remove-duplicates")
async def remove_duplicates(
    playlist_id: uuid.UUID,
    keep: str = Query("first", pattern="^(first|last)$"),
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
        select(PlaylistTrack)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    all_pts = result.scalars().all()

    seen_track_ids: dict[str, PlaylistTrack] = {}
    to_delete: list[PlaylistTrack] = []

    for pt in all_pts:
        tid = str(pt.track_id)
        if tid in seen_track_ids:
            if keep == "first":
                to_delete.append(pt)
            else:
                to_delete.append(seen_track_ids[tid])
                seen_track_ids[tid] = pt
        else:
            seen_track_ids[tid] = pt

    removed_count = len(to_delete)
    for pt in to_delete:
        await db.delete(pt)

    await db.flush()

    return {"message": f"Removed {removed_count} duplicate(s)", "removed": removed_count}
