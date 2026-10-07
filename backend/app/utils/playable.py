"""SQL filters for what listeners can actually play.

Searches and deleted empty tracks leave artists and albums without any
audio behind: listing them only leads to empty pages.

Built on each call, not at import: an expression built at import time would
freeze the column types before the test suite swaps them for SQLite ones.
"""
from sqlalchemy import exists, func, or_, select

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track


def has_audio():
    return or_(Track.file_url.isnot(None), Track.hls_path.isnot(None))


def artist_has_audio():
    return exists().where(Track.artist_id == Artist.id, has_audio())


def album_has_audio():
    return exists().where(Track.album_id == Album.id, has_audio())


def artist_plays():
    """Total plays of an artist's tracks, to rank artists by popularity."""
    return select(func.coalesce(func.sum(Track.play_count), 0)).where(Track.artist_id == Artist.id).scalar_subquery()


def album_plays():
    """Total plays of an album's tracks, to rank albums by popularity."""
    return select(func.coalesce(func.sum(Track.play_count), 0)).where(Track.album_id == Album.id).scalar_subquery()
