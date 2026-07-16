import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listening_history import ListeningHistory
from app.models.track import Track
from app.models.artist import Artist


async def get_user_top_tracks(
    user_id: uuid.UUID, db: AsyncSession, limit: int = 10
) -> list[dict]:
    result = await db.execute(
        select(
            ListeningHistory.track_id,
            func.count(ListeningHistory.id).label("play_count"),
            func.sum(ListeningHistory.duration_listened_seconds).label("total_seconds"),
        )
        .where(ListeningHistory.user_id == user_id)
        .group_by(ListeningHistory.track_id)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(limit)
    )
    rows = result.all()
    tracks = []
    for row in rows:
        track_result = await db.execute(
            select(Track).where(Track.id == row.track_id)
        )
        track = track_result.scalar_one_or_none()
        if track:
            artist_result = await db.execute(
                select(Artist).where(Artist.id == track.artist_id)
            )
            track.artist = artist_result.scalar_one_or_none()
            tracks.append({
                "track": track,
                "play_count": row.play_count,
                "total_seconds": row.total_seconds,
            })
    return tracks


async def get_user_top_artists(
    user_id: uuid.UUID, db: AsyncSession, limit: int = 10
) -> list[dict]:
    subq = (
        select(Track.artist_id)
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id)
    ).subquery()

    result = await db.execute(
        select(subq.c.artist_id, func.count().label("play_count"))
        .group_by(subq.c.artist_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = result.all()
    artists = []
    for row in rows:
        artist_result = await db.execute(select(Artist).where(Artist.id == row.artist_id))
        artist = artist_result.scalar_one_or_none()
        if artist:
            artists.append({"artist": artist, "play_count": row.play_count})
    return artists


async def get_total_listening_time(user_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.sum(ListeningHistory.duration_listened_seconds))
        .where(ListeningHistory.user_id == user_id)
    )
    return result.scalar() or 0


async def get_monthly_stats(user_id: uuid.UUID, db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(
            func.count(ListeningHistory.id).label("total_plays"),
            func.sum(ListeningHistory.duration_listened_seconds).label("total_seconds"),
            func.count(func.distinct(ListeningHistory.track_id)).label("unique_tracks"),
        )
        .where(ListeningHistory.user_id == user_id)
        .where(ListeningHistory.played_at >= month_start)
    )
    row = result.one()
    return {
        "total_plays": row.total_plays or 0,
        "total_seconds": row.total_seconds or 0,
        "unique_tracks": row.unique_tracks or 0,
    }


async def get_genre_distribution(user_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Track.genre, func.count(ListeningHistory.id).label("play_count"))
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id, Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(func.count(ListeningHistory.id).desc())
    )
    rows = result.all()
    total = sum(r.play_count for r in rows) or 1
    return [
        {
            "genre": r.genre,
            "play_count": r.play_count,
            "percentage": round(r.play_count / total * 100, 1),
        }
        for r in rows
    ]


async def get_listening_by_hour(user_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(
            extract("hour", ListeningHistory.played_at).label("hour"),
            func.count(ListeningHistory.id).label("play_count"),
        )
        .where(ListeningHistory.user_id == user_id)
        .group_by(extract("hour", ListeningHistory.played_at))
        .order_by(extract("hour", ListeningHistory.played_at))
    )
    rows = {int(r.hour): r.play_count for r in result.all()}
    return [
        {"hour": h, "play_count": rows.get(h, 0)}
        for h in range(24)
    ]


async def get_listening_streak(user_id: uuid.UUID, db: AsyncSession) -> dict:
    result = await db.execute(
        select(func.date(ListeningHistory.played_at).label("listen_date"))
        .where(ListeningHistory.user_id == user_id)
        .distinct()
        .order_by(func.date(ListeningHistory.played_at).desc())
    )
    dates = [row.listen_date for row in result.all()]

    if not dates:
        return {"current_streak": 0, "longest_streak": 0}

    today = datetime.now(timezone.utc).date()

    # Current streak
    current_streak = 0
    expected_date = today
    for d in dates:
        if d == expected_date:
            current_streak += 1
            expected_date -= timedelta(days=1)
        elif d == expected_date - timedelta(days=1):
            # yesterday counts as current streak of 1
            if current_streak == 0:
                current_streak = 1
                expected_date = d - timedelta(days=1)
            break
        else:
            break

    # Longest streak
    longest = 1
    streak = 1
    for i in range(len(dates) - 1):
        if (dates[i] - dates[i + 1]).days == 1:
            streak += 1
            longest = max(longest, streak)
        elif (dates[i] - dates[i + 1]).days > 1:
            streak = 1

    return {
        "current_streak": current_streak,
        "longest_streak": max(longest, current_streak),
    }


async def get_annual_wrapped(user_id: uuid.UUID, year: int, db: AsyncSession) -> dict:
    year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
    year_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    # Total stats
    total_result = await db.execute(
        select(
            func.count(ListeningHistory.id).label("total_plays"),
            func.sum(ListeningHistory.duration_listened_seconds).label("total_seconds"),
            func.count(func.distinct(ListeningHistory.track_id)).label("unique_tracks"),
            func.count(func.distinct(ListeningHistory.played_at)).label("active_days"),
        )
        .where(ListeningHistory.user_id == user_id)
        .where(ListeningHistory.played_at >= year_start)
        .where(ListeningHistory.played_at < year_end)
    )
    total_row = total_result.one()

    # Top tracks
    top_tracks_result = await db.execute(
        select(
            ListeningHistory.track_id,
            func.count(ListeningHistory.id).label("play_count"),
        )
        .join(Track, Track.id == ListeningHistory.track_id)
        .where(ListeningHistory.user_id == user_id)
        .where(ListeningHistory.played_at >= year_start)
        .where(ListeningHistory.played_at < year_end)
        .group_by(ListeningHistory.track_id)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(10)
    )
    top_tracks = []
    for row in top_tracks_result.all():
        track_result = await db.execute(select(Track).where(Track.id == row.track_id))
        track = track_result.scalar_one_or_none()
        if track:
            top_tracks.append({
                "track_id": str(track.id),
                "title": track.title,
                "artist_id": str(track.artist_id),
                "play_count": row.play_count,
            })

    # Top artists
    top_artists_result = await db.execute(
        select(
            Track.artist_id,
            func.count(ListeningHistory.id).label("play_count"),
        )
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id)
        .where(ListeningHistory.played_at >= year_start)
        .where(ListeningHistory.played_at < year_end)
        .group_by(Track.artist_id)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(10)
    )
    top_artists = []
    for row in top_artists_result.all():
        artist_result = await db.execute(select(Artist).where(Artist.id == row.artist_id))
        artist = artist_result.scalar_one_or_none()
        if artist:
            top_artists.append({
                "artist_id": str(artist.id),
                "name": artist.name,
                "play_count": row.play_count,
            })

    # Top genres
    genre_result = await db.execute(
        select(Track.genre, func.count(ListeningHistory.id).label("play_count"))
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id)
        .where(ListeningHistory.played_at >= year_start)
        .where(ListeningHistory.played_at < year_end)
        .where(Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(5)
    )
    top_genres = [{"genre": r.genre, "play_count": r.play_count} for r in genre_result.all()]

    return {
        "year": year,
        "total_plays": total_row.total_plays or 0,
        "total_seconds": total_row.total_seconds or 0,
        "unique_tracks": total_row.unique_tracks or 0,
        "active_days": total_row.active_days or 0,
        "top_tracks": top_tracks,
        "top_artists": top_artists,
        "top_genres": top_genres,
    }
