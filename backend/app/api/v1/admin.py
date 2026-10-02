import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.core.sessions import revoke_all_for_user
from app.models.album import Album
from app.models.artist import Artist
from app.models.device_session import DeviceSession
from app.models.jam import JamSession
from app.models.listening_history import ListeningHistory
from app.models.playlist import Playlist
from app.models.track import Track
from app.models.user import User, UserRole
from app.schemas.user import UserResponse
from app.services.admin_overview import get_overview, merge_missing_duplicates, purge_unplayable_tracks
from app.utils.deps import require_admin
from app.utils.storage import get_storage_used

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

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()
    activity = await _users_activity(db, [u.id for u in users])

    return {
        "items": [
            {**UserResponse.model_validate(u).model_dump(mode="json"), **activity.get(u.id, _NO_ACTIVITY)}
            for u in users
        ],
        "total": total,
        "pages": (total + page_size - 1) // page_size,
    }


_NO_ACTIVITY = {"play_count": 0, "last_played_at": None, "last_seen_at": None, "playlist_count": 0, "device_count": 0}


async def _users_activity(db: AsyncSession, user_ids: list) -> dict:
    """Plays, last listen, last device heartbeat, playlists and devices per user."""
    if not user_ids:
        return {}
    activity = {uid: dict(_NO_ACTIVITY) for uid in user_ids}

    plays = await db.execute(
        select(ListeningHistory.user_id, func.count(ListeningHistory.id), func.max(ListeningHistory.played_at))
        .where(ListeningHistory.user_id.in_(user_ids))
        .group_by(ListeningHistory.user_id)
    )
    for uid, count, last in plays.all():
        activity[uid]["play_count"] = count
        activity[uid]["last_played_at"] = last.isoformat() if last else None

    devices = await db.execute(
        select(DeviceSession.user_id, func.count(DeviceSession.id), func.max(DeviceSession.last_active_at))
        .where(DeviceSession.user_id.in_(user_ids))
        .group_by(DeviceSession.user_id)
    )
    for uid, count, last in devices.all():
        activity[uid]["device_count"] = count
        activity[uid]["last_seen_at"] = last.isoformat() if last else None

    playlists = await db.execute(
        select(Playlist.owner_id, func.count(Playlist.id))
        .where(Playlist.owner_id.in_(user_ids))
        .group_by(Playlist.owner_id)
    )
    for uid, count in playlists.all():
        activity[uid]["playlist_count"] = count

    return activity


@router.post("/catalogue/purge-unplayable")
async def purge_unplayable(
    dry_run: bool = Query(True, description="Only count what would be deleted"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete tracks without audio that no playlist, favorite or history uses."""
    return await purge_unplayable_tracks(db, dry_run=dry_run)


@router.post("/catalogue/merge-missing-duplicates")
async def merge_missing(
    dry_run: bool = Query(True, description="Only count what would be merged"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Merge tracks whose file is missing into the identical track that still exists."""
    return await merge_missing_duplicates(db, dry_run=dry_run)


@router.get("/overview")
async def overview(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Users, catalogue availability, music folders, services, config and warnings."""
    return await get_overview(db)


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
    if not user.is_active:
        # Disabling must end the sessions already open, not only new logins.
        await revoke_all_for_user(str(user.id))
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
    # Personal data goes too, and the password can never match again.
    user.avatar_url = None
    user.bio = None
    user.country = None
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    await revoke_all_for_user(str(user.id))
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
        select(Artist.id, Artist.name, func.count(ListeningHistory.id).label("plays"))
        .join(Track, Artist.id == Track.artist_id)
        .join(ListeningHistory, Track.id == ListeningHistory.track_id)
        .group_by(Artist.id, Artist.name)
        .order_by(desc("plays"))
        .limit(10)
    )
    top_artists = [
        {"id": row[0], "name": row[1], "play_count": row[2]}
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
