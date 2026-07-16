from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track
from app.models.playlist import Playlist
from app.models.podcast import Podcast
from app.schemas.artist import ArtistResponse
from app.schemas.album import AlbumResponse
from app.schemas.track import TrackResponse
from app.schemas.playlist import PlaylistResponse
from app.services.meilisearch import search_meili
from app.services.musicbrainz import search_recordings, search_artists
from app.services.jiosaavn import search_jiosaavn, import_from_jiosaavn

router = APIRouter(prefix="/search", tags=["search"])


async def _try_meilisearch(query: str, index: str, limit: int, offset: int) -> list[dict]:
    try:
        return await search_meili(query, index=index, limit=limit, offset=offset)
    except Exception:
        return []


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("tracks,artists,albums,playlists,podcasts"),
    genre: str | None = None,
    year: int | None = None,
    min_duration: int | None = None,
    max_duration: int | None = None,
    min_bpm: float | None = None,
    max_bpm: float | None = None,
    key: str | None = None,
    mood: str | None = None,
    lyrics: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    types = [t.strip() for t in type.split(",")]
    offset = (page - 1) * page_size
    results: dict = {}

    if "artists" in types:
        meili_hits = await _try_meilisearch(q, "artists", page_size, offset)
        if meili_hits:
            results["artists"] = [ArtistResponse(**a) for a in meili_hits]
        else:
            result = await db.execute(
                select(Artist).where(Artist.name.ilike(f"%{q}%")).offset(offset).limit(page_size)
            )
            results["artists"] = [ArtistResponse.model_validate(a) for a in result.scalars().all()]

    if "albums" in types:
        meili_hits = await _try_meilisearch(q, "albums", page_size, offset)
        if meili_hits:
            results["albums"] = [AlbumResponse(**a) for a in meili_hits]
        else:
            result = await db.execute(
                select(Album).where(Album.title.ilike(f"%{q}%")).offset(offset).limit(page_size)
            )
            results["albums"] = [AlbumResponse.model_validate(a) for a in result.scalars().all()]

    if "tracks" in types:
        meili_hits = await _try_meilisearch(q, "tracks", page_size, offset)
        if meili_hits and not any([genre, year, min_duration, max_duration, min_bpm, max_bpm, key, mood]):
            results["tracks"] = [TrackResponse(**t) for t in meili_hits]
        else:
            query = select(Track).where(Track.title.ilike(f"%{q}%"))
            if genre:
                query = query.where(Track.genre.ilike(genre))
            if year:
                query = query.where(Track.created_at >= f"{year}-01-01", Track.created_at < f"{year+1}-01-01")
            if min_duration is not None:
                query = query.where(Track.duration_seconds >= min_duration)
            if max_duration is not None:
                query = query.where(Track.duration_seconds <= max_duration)
            if min_bpm is not None:
                query = query.where(Track.bpm >= min_bpm)
            if max_bpm is not None:
                query = query.where(Track.bpm <= max_bpm)
            if key:
                query = query.where(Track.key.ilike(key))
            if mood:
                query = query.where(Track.mood.ilike(f"%{mood}%"))
            if lyrics:
                query = query.where(Track.lyrics_lrc.ilike(f"%{lyrics}%"))
            result = await db.execute(query.offset(offset).limit(page_size))
            local_tracks = [TrackResponse.model_validate(t) for t in result.scalars().all()]
            results["tracks"] = local_tracks

            if len(local_tracks) < page_size:
                jio_results = await search_jiosaavn(q, limit=page_size - len(local_tracks))
                imported_tracks = []
                for jio_song in jio_results:
                    track_id = await import_from_jiosaavn(jio_song, db)
                    if track_id:
                        track_result = await db.execute(select(Track).where(Track.id == track_id))
                        track = track_result.scalar_one_or_none()
                        if track:
                            imported_tracks.append(TrackResponse.model_validate(track))

                results["tracks"] = list(results["tracks"]) + imported_tracks

    if "playlists" in types:
        meili_hits = await _try_meilisearch(q, "playlists", page_size, offset)
        if meili_hits:
            results["playlists"] = [PlaylistResponse(**p) for p in meili_hits]
        else:
            result = await db.execute(
                select(Playlist).where(Playlist.is_public == True, Playlist.title.ilike(f"%{q}%")).offset(offset).limit(page_size)
            )
            results["playlists"] = [PlaylistResponse.model_validate(p) for p in result.scalars().all()]

    if "podcasts" in types:
        meili_hits = await _try_meilisearch(q, "podcasts", page_size, offset)
        if meili_hits:
            results["podcasts"] = meili_hits
        else:
            result = await db.execute(
                select(Podcast).where(Podcast.title.ilike(f"%{q}%")).offset(offset).limit(page_size)
            )
            from app.schemas.podcast import PodcastResponse
            results["podcasts"] = [PodcastResponse.model_validate(p) for p in result.scalars().all()]

    return results


@router.get("/jiosaavn")
async def search_jiosaavn_only(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    auto_import: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Search JioSaavn directly and optionally auto-import tracks."""
    jio_results = await search_jiosaavn(q, limit=limit)

    if not auto_import:
        return {"results": jio_results, "imported": []}

    imported = []
    for song in jio_results:
        track_id = await import_from_jiosaavn(song, db)
        if track_id:
            imported.append({
                "track_id": str(track_id),
                "title": song.get("title"),
                "artist": song.get("artist"),
            })

    return {
        "results": jio_results,
        "imported": imported,
    }


@router.get("/enriched")
async def search_enriched(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    auto_import: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """
    Search MusicBrainz for rich metadata + JioSaavn for audio download.
    Flow:
    1. MusicBrainz provides title, artist, album, duration, ISRC
    2. JioSaavn provides the MP3 download URL
    3. Combined result is imported into the database
    """
    mb_results = await search_recordings(q, limit=limit)

    enriched = []
    for mb_track in mb_results:
        search_query = f"{mb_track['title']} {mb_track['artist']}"
        jio_results = await search_jiosaavn(search_query, limit=1)

        jio_song = jio_results[0] if jio_results else None

        entry = {
            "title": mb_track["title"],
            "artist": mb_track["artist"],
            "album": mb_track["album"],
            "duration": mb_track["duration"],
            "isrc": mb_track.get("isrc"),
            "musicbrainz_id": mb_track.get("musicbrainz_id"),
            "download_url": jio_song.get("download_url") if jio_song else None,
            "image_url": jio_song.get("image_url") if jio_song else "",
            "jiosaavn_id": jio_song.get("jiosaavn_id") if jio_song else None,
            "imported": False,
        }

        if auto_import and jio_song:
            combined = {
                "title": mb_track["title"],
                "artist": mb_track["artist"],
                "album": mb_track["album"],
                "duration": mb_track["duration"],
                "image_url": jio_song.get("image_url", ""),
                "download_url": jio_song.get("download_url"),
                "language": jio_song.get("language", ""),
                "year": jio_song.get("year", ""),
            }
            track_id = await import_from_jiosaavn(combined, db)
            if track_id:
                entry["track_id"] = str(track_id)
                entry["imported"] = True

        enriched.append(entry)

    return {
        "query": q,
        "count": len(enriched),
        "results": enriched,
    }
