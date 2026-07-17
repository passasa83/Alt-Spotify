import uuid
from datetime import datetime
from app.models.track import Track


def serialize_track(track: Track) -> dict:
    artist_data = None
    if hasattr(track, 'artist') and track.artist:
        artist_data = {
            "id": str(track.artist.id),
            "name": track.artist.name,
            "bio": getattr(track.artist, 'bio', None),
            "image_url": getattr(track.artist, 'image_url', None),
            "links": getattr(track.artist, 'links', None),
            "created_at": track.artist.created_at.isoformat() if hasattr(track.artist, 'created_at') and track.artist.created_at else None,
        }

    album_data = None
    if hasattr(track, 'album') and track.album:
        album_data = {
            "id": str(track.album.id),
            "title": track.album.title,
            "artist_id": str(track.album.artist_id),
            "release_date": track.album.release_date.isoformat() if hasattr(track.album, 'release_date') and track.album.release_date else None,
            "cover_url": getattr(track.album, 'cover_url', None),
            "created_at": track.album.created_at.isoformat() if hasattr(track.album, 'created_at') and track.album.created_at else None,
        }

    return {
        "id": str(track.id),
        "title": track.title,
        "album_id": str(track.album_id) if track.album_id else None,
        "artist_id": str(track.artist_id),
        "duration_seconds": track.duration_seconds,
        "file_url": track.file_url,
        "hls_path": track.hls_path,
        "cover_url": track.cover_url,
        "genre": track.genre,
        "bpm": track.bpm,
        "key": track.key,
        "mood": track.mood,
        "lyrics_lrc": track.lyrics_lrc,
        "track_gain": track.track_gain,
        "track_peak": track.track_peak,
        "album_gain": track.album_gain,
        "isrc": track.isrc,
        "allowed_territories": track.allowed_territories,
        "is_explicit": track.is_explicit,
        "play_count": track.play_count,
        "created_at": track.created_at.isoformat() if track.created_at else None,
        "artist": artist_data,
        "album": album_data,
    }
