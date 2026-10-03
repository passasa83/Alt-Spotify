"""Delete tracks together with everything that points to them."""
from sqlalchemy import delete, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.album import Album
from app.models.artist import Artist
from app.models.favorite import Favorite
from app.models.follow import Follow, FollowType
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


async def orphan_catalogue(db: AsyncSession, ignoring_tracks: list | None = None) -> tuple[list, list]:
    """Albums without any track, and artists without any track or album.

    ``ignoring_tracks`` counts these tracks as already gone (dry runs).
    """
    track_filter = [Track.id.notin_(ignoring_tracks)] if ignoring_tracks else []
    album_ids = list(
        (
            await db.execute(
                select(Album.id).where(~exists().where(Track.album_id == Album.id, *track_filter))
            )
        ).scalars().all()
    )
    album_filter = [Album.id.notin_(album_ids)] if album_ids else []
    artist_ids = list(
        (
            await db.execute(
                select(Artist.id).where(
                    ~exists().where(Track.artist_id == Artist.id, *track_filter),
                    ~exists().where(Album.artist_id == Artist.id, *album_filter),
                )
            )
        ).scalars().all()
    )
    return album_ids, artist_ids


async def delete_orphan_catalogue(db: AsyncSession) -> tuple[int, int]:
    """Delete albums and artists left without tracks (search leftovers), with
    the likes and follows pointing to them. Returns (albums, artists)."""
    album_ids, artist_ids = await orphan_catalogue(db)
    if album_ids:
        await db.execute(delete(Favorite).where(Favorite.entity_type == "album", Favorite.entity_id.in_(album_ids)))
        await db.execute(delete(Album).where(Album.id.in_(album_ids)))
    if artist_ids:
        await db.execute(delete(Favorite).where(Favorite.entity_type == "artist", Favorite.entity_id.in_(artist_ids)))
        await db.execute(
            delete(Follow).where(Follow.follow_type == FollowType.ARTIST, Follow.followed_id.in_(artist_ids))
        )
        await db.execute(delete(Artist).where(Artist.id.in_(artist_ids)))
    await db.flush()
    return len(album_ids), len(artist_ids)
