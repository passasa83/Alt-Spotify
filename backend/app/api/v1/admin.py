from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, text, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.core.database import get_db
from app.utils.deps import require_admin
from app.utils.storage import get_storage_used
from app.models.user import User, UserRole
from app.models.track import Track
from app.models.album import Album
from app.models.artist import Artist
from app.models.listening_history import ListeningHistory
from app.models.jam import JamSession
from app.schemas.user import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
async def get_dashboard(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0
    total_tracks = (await db.execute(select(func.count(Track.id)))).scalar() or 0

    today_start = datetime.now(timezone.utc).replace(tzinfo=None).replace(hour=0, minute=0, second=0, microsecond=0)
    plays_today = (
        await db.execute(
            select(func.count(ListeningHistory.id)).where(
                ListeningHistory.played_at >= today_start
            )
        )
    ).scalar() or 0

    active_sessions = (
        await db.execute(
            select(func.count(JamSession.id)).where(JamSession.status == "ACTIVE")
        )
    ).scalar() or 0

    return {
        "total_users": total_users,
        "total_tracks": total_tracks,
        "plays_today": plays_today,
        "storage_used": get_storage_used(),
        "active_jam_sessions": active_sessions,
    }


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    role: str | None = None,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            User.email.ilike(search_term) | User.pseudo.ilike(search_term)
        )

    if role:
        try:
            user_role = UserRole(role)
            query = query.where(User.role == user_role)
        except ValueError:
            pass

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "items": [UserResponse.model_validate(u) for u in users],
        "total": total,
        "pages": (total + page_size - 1) // page_size,
    }


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = __import__("uuid").UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_role = body.get("role")
    if new_role not in ["ADMIN", "USER"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user.role = UserRole(new_role)
    return {"status": "ok"}


@router.put("/users/{user_id}/active")
async def toggle_user_active(
    user_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = __import__("uuid").UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = body.get("is_active", True)
    return {"status": "ok"}


@router.delete("/users/{user_id}")
async def soft_delete_user(
    user_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = __import__("uuid").UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    user.email = f"deleted_{user.id}@alt-spotify.local"
    user.pseudo = f"deleted_{str(user.id)[:8]}"
    return {"status": "ok"}


@router.get("/catalogue/stats")
async def catalogue_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_tracks = (await db.execute(select(func.count(Track.id)))).scalar() or 0
    total_albums = (await db.execute(select(func.count(Album.id)))).scalar() or 0
    total_artists = (await db.execute(select(func.count(Artist.id)))).scalar() or 0

    genre_result = await db.execute(
        select(Track.genre, func.count(Track.id))
        .where(Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(desc(func.count(Track.id)))
    )
    tracks_by_genre = [{"genre": row[0], "count": row[1]} for row in genre_result.all()]

    most_played_result = await db.execute(
        select(Track.title, Artist.name, Track.play_count)
        .join(Artist, Track.artist_id == Artist.id)
        .order_by(desc(Track.play_count))
        .limit(10)
    )
    most_played = [
        {"title": row[0], "artist": row[1], "play_count": row[2]}
        for row in most_played_result.all()
    ]

    storage_per_artist_result = await db.execute(
        select(Artist.name, func.count(Track.id))
        .join(Track, Artist.id == Track.artist_id)
        .group_by(Artist.name)
        .order_by(desc(func.count(Track.id)))
        .limit(10)
    )
    storage_per_artist = [
        {"artist": row[0], "storage": f"{row[1]} tracks"}
        for row in storage_per_artist_result.all()
    ]

    return {
        "total_tracks": total_tracks,
        "total_albums": total_albums,
        "total_artists": total_artists,
        "storage_used": get_storage_used(),
        "tracks_by_genre": tracks_by_genre,
        "most_played": most_played,
        "storage_per_artist": storage_per_artist,
    }


@router.get("/analytics/plays-per-day")
async def plays_per_day(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    thirty_days_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    result = await db.execute(
        text("""
            SELECT DATE(played_at) as play_date, COUNT(*) as play_count
            FROM listening_history
            WHERE played_at >= :since
            GROUP BY DATE(played_at)
            ORDER BY play_date
        """),
        {"since": thirty_days_ago},
    )
    rows = result.all()
    return [{"date": str(row[0]), "plays": row[1]} for row in rows]


@router.get("/analytics/active-users")
async def active_users_per_day(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    thirty_days_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    result = await db.execute(
        text("""
            SELECT DATE(played_at) as activity_date, COUNT(DISTINCT user_id) as active_count
            FROM listening_history
            WHERE played_at >= :since
            GROUP BY DATE(played_at)
            ORDER BY activity_date
        """),
        {"since": thirty_days_ago},
    )
    rows = result.all()
    return [{"date": str(row[0]), "active_users": row[1]} for row in rows]


@router.get("/analytics/top-content")
async def top_content(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    top_tracks_result = await db.execute(
        select(Track.title, Artist.name, Track.play_count)
        .join(Artist, Track.artist_id == Artist.id)
        .order_by(desc(Track.play_count))
        .limit(10)
    )
    top_tracks = [
        {"title": row[0], "artist": row[1], "play_count": row[2]}
        for row in top_tracks_result.all()
    ]

    top_artists_result = await db.execute(
        select(Artist.name, func.count(ListeningHistory.id).label("plays"))
        .join(Track, Artist.id == Track.artist_id)
        .join(ListeningHistory, Track.id == ListeningHistory.track_id)
        .group_by(Artist.name)
        .order_by(desc("plays"))
        .limit(10)
    )
    top_artists = [
        {"name": row[0], "play_count": row[1]}
        for row in top_artists_result.all()
    ]

    top_albums_result = await db.execute(
        select(Album.title, Artist.name, func.count(ListeningHistory.id).label("plays"))
        .join(Track, Album.id == Track.album_id)
        .join(Artist, Track.artist_id == Artist.id)
        .join(ListeningHistory, Track.id == ListeningHistory.track_id)
        .group_by(Album.title, Artist.name)
        .order_by(desc("plays"))
        .limit(10)
    )
    top_albums = [
        {"title": row[0], "artist": row[1], "play_count": row[2]}
        for row in top_albums_result.all()
    ]

    return {
        "top_tracks": top_tracks,
        "top_artists": top_artists,
        "top_albums": top_albums,
    }
