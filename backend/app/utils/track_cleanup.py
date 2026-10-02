"""Delete tracks together with everything that points to them."""
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.jam import JamSession
from app.models.listening_history import ListeningHistory
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track


async def delete_tracks(db: AsyncSession, track_ids: list) -> int:
    """Remove the tracks from playlists, favorites, history and jams, then
    delete them. Without this the foreign keys make the delete fail as soon
    as anyone saved the track somewhere."""
    if not track_ids:
        return 0
    await db.execute(delete(PlaylistTrack).where(PlaylistTrack.track_id.in_(track_ids)))
    await db.execute(delete(Favorite).where(Favorite.entity_type == "track", Favorite.entity_id.in_(track_ids)))
    await db.execute(delete(ListeningHistory).where(ListeningHistory.track_id.in_(track_ids)))
    await db.execute(update(JamSession).where(JamSession.current_track_id.in_(track_ids)).values(current_track_id=None))
    result = await db.execute(delete(Track).where(Track.id.in_(track_ids)))
    await db.flush()
    return result.rowcount or 0
