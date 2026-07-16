import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.models.listening_history import ListeningHistory


SMART_RULE_TYPES = {
    "genre": {"ops": ["equals", "not_equals", "contains"]},
    "play_count": {"ops": ["gte", "lte", "eq"]},
    "duration_seconds": {"ops": ["gte", "lte"]},
    "artist_name": {"ops": ["equals", "contains"]},
    "is_explicit": {"ops": ["equals"]},
    "recently_listened": {"ops": ["days"]},
    "most_listened": {"ops": ["gte"]},
    "least_listened": {"ops": ["lte"]},
}


def _build_track_query(rules: dict, user_id: uuid.UUID, db: AsyncSession):
    """Build a SQLAlchemy query based on smart playlist rules."""
    query = select(Track).distinct()
    conditions = []

    if "genre" in rules:
        genre_rules = rules["genre"]
        if isinstance(genre_rules, dict):
            op = genre_rules.get("op", "equals")
            val = genre_rules.get("value", "")
            if op == "equals":
                conditions.append(Track.genre.ilike(val))
            elif op == "not_equals":
                conditions.append(or_(Track.genre.is_(None), ~Track.genre.ilike(val)))
            elif op == "contains":
                conditions.append(Track.genre.ilike(f"%{val}%"))
        elif isinstance(genre_rules, list):
            for gr in genre_rules:
                conditions.append(Track.genre.ilike(gr))

    if "is_explicit" in rules:
        val = rules["is_explicit"]
        if isinstance(val, dict):
            conditions.append(Track.is_explicit == val.get("value", False))
        else:
            conditions.append(Track.is_explicit == val)

    if "play_count_min" in rules:
        conditions.append(Track.play_count >= rules["play_count_min"])

    if "play_count_max" in rules:
        conditions.append(Track.play_count <= rules["play_count_max"])

    if "duration_min" in rules:
        conditions.append(Track.duration_seconds >= rules["duration_min"])

    if "duration_max" in rules:
        conditions.append(Track.duration_seconds <= rules["duration_max"])

    if "artist_name" in rules:
        artist_rules = rules["artist_name"]
        if isinstance(artist_rules, dict):
            op = artist_rules.get("op", "contains")
            val = artist_rules.get("value", "")
            from app.models.artist import Artist
            query = query.join(Artist, Track.artist_id == Artist.id)
            if op == "equals":
                conditions.append(Artist.name.ilike(val))
            elif op == "contains":
                conditions.append(Artist.name.ilike(f"%{val}%"))

    if "recently_listened_days" in rules:
        days = rules["recently_listened_days"]
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        query = query.join(ListeningHistory, ListeningHistory.track_id == Track.id)
        conditions.append(ListeningHistory.played_at >= since)
        conditions.append(ListeningHistory.user_id == user_id)

    if "top_listened" in rules:
        query = query.join(ListeningHistory, ListeningHistory.track_id == Track.id)
        conditions.append(ListeningHistory.user_id == user_id)
        query = query.group_by(Track.id)
        query = query.order_by(func.count(ListeningHistory.id).desc())
        limit = rules["top_listened"]
        query = query.limit(limit)

    if "least_listened" in rules:
        query = query.join(ListeningHistory, ListeningHistory.track_id == Track.id, isouter=True)
        conditions.append(ListeningHistory.user_id == user_id)
        query = query.group_by(Track.id)
        query = query.order_by(func.count(ListeningHistory.id).asc())
        limit = rules["least_listened"]
        query = query.limit(limit)

    if conditions:
        query = query.where(and_(*conditions))

    return query


async def evaluate_smart_playlist(playlist: Playlist, db: AsyncSession) -> int:
    """Evaluate a smart playlist's rules and populate it with matching tracks.
    Returns the number of tracks added.
    """
    rules = playlist.smart_rules or {}
    user_id = playlist.owner_id
    max_tracks = playlist.max_tracks or 50

    await db.execute(
        select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id)
    )
    from sqlalchemy import delete
    await db.execute(
        delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id)
    )

    query = _build_track_query(rules, user_id, db)

    if "top_listened" not in rules and "least_listened" not in rules:
        query = query.order_by(Track.play_count.desc())

    query = query.limit(max_tracks)

    result = await db.execute(query)
    tracks = result.scalars().all()

    for i, track in enumerate(tracks):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=i,
            added_by=user_id,
        )
        db.add(pt)

    playlist.last_refreshed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    return len(tracks)
