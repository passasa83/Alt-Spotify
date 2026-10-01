import random
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.listening_history import ListeningHistory
from app.models.track import Track
from app.models.user import User


async def get_similar_tracks(track_id: uuid.UUID, db: AsyncSession, limit: int = 10) -> list[Track]:
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        return []

    query = (
        select(Track)
        .where(Track.id != track_id)
        .where((Track.genre == track.genre) | (Track.artist_id == track.artist_id))
        .order_by(Track.play_count.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_radio_tracks(track_id: uuid.UUID, db: AsyncSession, limit: int = 20) -> list[Track]:
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        return []

    # Get tracks by same genre
    genre_query = (
        select(Track)
        .where(Track.id != track_id, Track.genre == track.genre)
        .order_by(Track.play_count.desc())
        .limit(limit)
    )
    genre_result = await db.execute(genre_query)
    genre_tracks = list(genre_result.scalars().all())

    # Get tracks by same artist
    artist_query = (
        select(Track)
        .where(Track.id != track_id, Track.artist_id == track.artist_id)
        .order_by(Track.play_count.desc())
        .limit(limit)
    )
    artist_result = await db.execute(artist_query)
    artist_tracks = list(artist_result.scalars().all())

    # Combine and deduplicate
    seen = {track_id}
    combined = []
    for t in genre_tracks + artist_tracks:
        if t.id not in seen:
            seen.add(t.id)
            combined.append(t)

    # Shuffle for variety
    random.shuffle(combined)
    return combined[:limit]


async def get_personalized_recommendations(user_id: uuid.UUID, db: AsyncSession, limit: int = 20) -> list[Track]:
    # Get user's top genres from listening history
    genre_subq = (
        select(Track.genre, func.count(ListeningHistory.id).label("play_count"))
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id, Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(5)
    ).subquery()

    result = await db.execute(select(genre_subq.c.genre))
    top_genres = [row[0] for row in result.all()]

    if not top_genres:
        # Fallback: return popular tracks
        query = select(Track).order_by(Track.play_count.desc()).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    # Get tracks from top genres that user hasn't played
    played_subq = (
        select(ListeningHistory.track_id)
        .where(ListeningHistory.user_id == user_id)
    ).subquery()

    query = (
        select(Track)
        .where(Track.genre.in_(top_genres))
        .where(Track.id.notin_(select(played_subq.c.track_id)))
        .order_by(Track.play_count.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def generate_daily_mix(user_id: uuid.UUID, db: AsyncSession, mix_count: int = 6) -> list[dict]:
    # Get user's top genres
    genre_subq = (
        select(Track.genre, func.count(ListeningHistory.id).label("play_count"))
        .join(ListeningHistory, ListeningHistory.track_id == Track.id)
        .where(ListeningHistory.user_id == user_id, Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(func.count(ListeningHistory.id).desc())
        .limit(mix_count)
    ).subquery()

    result = await db.execute(select(genre_subq.c.genre, genre_subq.c.play_count))
    genre_rows = result.all()

    mixes = []
    for i, row in enumerate(genre_rows):
        genre = row.genre

        # Get top tracks in this genre
        query = (
            select(Track)
            .where(Track.genre == genre)
            .order_by(Track.play_count.desc())
            .limit(50)
        )
        track_result = await db.execute(query)
        tracks = list(track_result.scalars().all())

        # Pick up to 25 random tracks
        selected = random.sample(tracks, min(25, len(tracks))) if tracks else []

        mixes.append({
            "mix_id": str(uuid.uuid4()),
            "title": f"Daily Mix {i + 1}",
            "description": f"Based on your love of {genre}",
            "genre": genre,
            "track_count": len(selected),
            "tracks": [
                {"track_id": str(t.id), "title": t.title, "artist_id": str(t.artist_id)}
                for t in selected
            ],
        })

    # Fill remaining mixes with popular tracks if not enough genres
    while len(mixes) < mix_count:
        query = select(Track).order_by(Track.play_count.desc()).limit(25)
        result = await db.execute(query)
        fallback_tracks = list(result.scalars().all())
        mixes.append({
            "mix_id": str(uuid.uuid4()),
            "title": f"Daily Mix {len(mixes) + 1}",
            "description": "Popular tracks picked for you",
            "genre": None,
            "track_count": len(fallback_tracks),
            "tracks": [
                {"track_id": str(t.id), "title": t.title, "artist_id": str(t.artist_id)}
                for t in fallback_tracks
            ],
        })

    return mixes


async def get_autoplay_tracks(
    track_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    exclude: set[uuid.UUID] | None = None,
    limit: int = 10,
) -> list[Track]:
    """Playable tracks to continue listening after ``track_id``.

    Same artist or genre first, topped up with popular tracks so the player
    never runs dry. Only tracks with audio the user is allowed to hear.
    """
    result = await db.execute(select(Track).where(Track.id == track_id))
    seed = result.scalar_one_or_none()
    if not seed:
        return []

    excluded = set(exclude or ()) | {track_id}

    def playable_query():
        query = (
            select(Track)
            .options(selectinload(Track.artist), selectinload(Track.album))
            .where(or_(Track.file_url.isnot(None), Track.hls_path.isnot(None)))
            .where(Track.id.notin_(excluded))
        )
        if user.is_child_account:
            query = query.where(Track.is_explicit.is_(False))
        return query

    def allowed(track: Track) -> bool:
        return not track.allowed_territories or (
            bool(user.country) and user.country in track.allowed_territories
        )

    related = Track.artist_id == seed.artist_id
    if seed.genre:
        related = or_(related, Track.genre == seed.genre)
    similar = await db.execute(playable_query().where(related).order_by(func.random()).limit(limit * 2))
    picked = [t for t in similar.scalars().all() if allowed(t)][:limit]

    if len(picked) < limit:
        # Same type as the rest of the set (ids may load as str on some drivers).
        excluded |= {uuid.UUID(str(t.id)) for t in picked}
        popular = await db.execute(
            playable_query().order_by(Track.play_count.desc()).limit((limit - len(picked)) * 2)
        )
        picked += [t for t in popular.scalars().all() if allowed(t)][: limit - len(picked)]

    return picked
