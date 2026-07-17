from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track
from app.models.playlist import Playlist
from app.models.podcast import Podcast
from app.schemas.artist import ArtistResponse
from app.schemas.album import AlbumResponse
from app.schemas.track import TrackResponse, SearchTrackResponse
from app.schemas.playlist import PlaylistResponse
from app.services.deezer import search_deezer, download_deezer_preview
from app.services.jiosaavn import search_jiosaavn, import_from_jiosaavn
from app.services.meilisearch import search_meili
from app.services.musicbrainz import search_recordings, search_artists

router = APIRouter(prefix="/search", tags=["search"])

import re


def _normalize_title(title: str) -> str:
    """Normalize title for dedup: strip suffixes like (Remaster), (Radio Edit), etc."""
    t = title.lower().strip()
    t = re.sub(r"\s*[-–]\s*(remaster(ed)?\s*\d*|radio edit|single|album version|deluxe|explicit|clean|remix|live|acoustic|version|remaster\s*\d{4})", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?remaster.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?radio edit.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?explicit.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?clean.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?remix.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?live.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?acoustic.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(.*?version.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(feat\.?.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*\(ft\.?.*?\)", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _track_to_response(track: Track, artist_name: str = "", artist_image_url: str | None = None) -> SearchTrackResponse:
    artist_data = None
    if artist_name:
        artist_data = {"id": str(track.artist_id), "name": artist_name}
        if artist_image_url:
            artist_data["image_url"] = artist_image_url
    return SearchTrackResponse(
        id=track.id,
        title=track.title,
        album_id=track.album_id,
        artist_id=track.artist_id,
        artist=artist_data,
        duration_seconds=track.duration_seconds,
        file_url=track.file_url,
        hls_path=track.hls_path,
        cover_url=track.cover_url,
        genre=track.genre,
        bpm=track.bpm,
        key=track.key,
        mood=track.mood,
        lyrics_lrc=track.lyrics_lrc,
        track_gain=track.track_gain,
        track_peak=track.track_peak,
        album_gain=track.album_gain,
        isrc=track.isrc,
        allowed_territories=track.allowed_territories,
        is_explicit=track.is_explicit,
        play_count=track.play_count,
        created_at=track.created_at or datetime.now(timezone.utc).replace(tzinfo=None),
    )


async def _find_local_track(db: AsyncSession, isrc: str | None, title: str, artist_name: str) -> Track | None:
    """Find a track in the local DB by ISRC (exact match) or title+artist (fuzzy)."""
    if isrc:
        result = await db.execute(select(Track).where(Track.isrc == isrc))
        track = result.scalars().first()
        if track:
            return track

    artist_ids_subq = select(Artist.id).where(Artist.name.ilike(f"%{artist_name}%")).scalar_subquery()
    result = await db.execute(
        select(Track).where(
            Track.title.ilike(f"%{title}%"),
            Track.artist_id.in_(artist_ids_subq),
        ).limit(1)
    )
    return result.scalars().first()


async def _ensure_artist(db: AsyncSession, name: str, image_url: str | None = None) -> UUID:
    """Find or create an artist by name, return artist_id."""
    result = await db.execute(select(Artist).where(Artist.name.ilike(f"%{name}%")))
    artist = result.scalars().first()
    if artist:
        if image_url and not artist.image_url:
            artist.image_url = image_url
            await db.flush()
        return artist.id
    artist = Artist(name=name, image_url=image_url)
    db.add(artist)
    await db.flush()
    return artist.id


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
    like_pattern = f"%{q}%"

    if "artists" in types:
        result = await db.execute(
            select(Artist).where(Artist.name.ilike(like_pattern)).offset(offset).limit(page_size)
        )
        results["artists"] = [ArtistResponse.model_validate(a) for a in result.scalars().all()]

    if "albums" in types:
        result = await db.execute(
            select(Album).where(Album.title.ilike(like_pattern)).offset(offset).limit(page_size)
        )
        results["albums"] = [AlbumResponse.model_validate(a) for a in result.scalars().all()]

    if "tracks" in types:
        has_advanced_filters = any([genre, year, min_duration, max_duration, min_bpm, max_bpm, key, mood, lyrics])

        if has_advanced_filters:
            artist_ids_subq = select(Artist.id).where(Artist.name.ilike(like_pattern)).scalar_subquery()
            query_stmt = select(Track).where(
                or_(Track.title.ilike(like_pattern), Track.artist_id.in_(artist_ids_subq))
            )
            if genre:
                query_stmt = query_stmt.where(Track.genre.ilike(genre))
            if year:
                query_stmt = query_stmt.where(Track.created_at >= f"{year}-01-01", Track.created_at < f"{year+1}-01-01")
            if min_duration is not None:
                query_stmt = query_stmt.where(Track.duration_seconds >= min_duration)
            if max_duration is not None:
                query_stmt = query_stmt.where(Track.duration_seconds <= max_duration)
            if min_bpm is not None:
                query_stmt = query_stmt.where(Track.bpm >= min_bpm)
            if max_bpm is not None:
                query_stmt = query_stmt.where(Track.bpm <= max_bpm)
            if key:
                query_stmt = query_stmt.where(Track.key.ilike(key))
            if mood:
                query_stmt = query_stmt.where(Track.mood.ilike(f"%{mood}%"))
            if lyrics:
                query_stmt = query_stmt.where(Track.lyrics_lrc.ilike(f"%{lyrics}%"))
            result = await db.execute(query_stmt.offset(offset).limit(page_size))
            tracks = []
            for t in result.scalars().all():
                artist_result = await db.execute(select(Artist).where(Artist.id == t.artist_id))
                artist_obj = artist_result.scalar_one_or_none()
                tracks.append(_track_to_response(t, artist_obj.name if artist_obj else "", artist_obj.image_url if artist_obj else None))
            results["tracks"] = tracks
        else:
            artist_ids_subq = select(Artist.id).where(Artist.name.ilike(like_pattern)).scalar_subquery()
            local_result = await db.execute(
                select(Track).where(
                    or_(Track.title.ilike(like_pattern), Track.artist_id.in_(artist_ids_subq))
                ).limit(page_size)
            )
            local_tracks_map: dict[str, tuple[Track, str]] = {}
            local_artist_images: dict[str, str | None] = {}
            for t in local_result.scalars().all():
                artist_result = await db.execute(select(Artist).where(Artist.id == t.artist_id))
                artist_obj = artist_result.scalar_one_or_none()
                aname = artist_obj.name if artist_obj else ""
                aimg = artist_obj.image_url if artist_obj else None
                dedup_key = f"{_normalize_title(t.title)}|{_normalize_title(aname)}"
                local_tracks_map[dedup_key] = (t, aname)
                if aimg:
                    local_artist_images[dedup_key] = aimg

            external_results = await search_deezer(q, limit=page_size)

            tracks = []
            seen_isrcs: set[str] = set()
            seen_keys: set[str] = set()

            for ext in external_results:
                ext_isrc = ext.get("isrc")
                ext_dedup_key = f"{_normalize_title(ext['title'])}|{_normalize_title(ext['artist'])}"
                local_match = local_tracks_map.get(ext_dedup_key)

                if ext_isrc and ext_isrc in seen_isrcs:
                    continue

                if local_match:
                    aimg = local_artist_images.get(ext_dedup_key)
                    tracks.append(_track_to_response(local_match[0], local_match[1], aimg))
                    seen_keys.add(ext_dedup_key)
                    if ext_isrc:
                        seen_isrcs.add(ext_isrc)
                else:
                    if ext_dedup_key not in seen_keys:
                        artist_picture = ext.get("artist_picture")
                        artist_id = await _ensure_artist(db, ext["artist"], artist_picture)
                        stub = Track(
                            title=ext["title"],
                            artist_id=artist_id,
                            duration_seconds=ext.get("duration", 0),
                            cover_url=ext.get("cover_url"),
                            isrc=ext.get("isrc"),
                            genre=genre,
                            is_explicit=ext.get("explicit", False),
                            file_url=None,
                            hls_path=None,
                        )
                        db.add(stub)
                        await db.flush()
                        tracks.append(_track_to_response(stub, ext["artist"], artist_picture))
                        seen_keys.add(ext_dedup_key)
                        if ext_isrc:
                            seen_isrcs.add(ext_isrc)

            for dedup_key, (t, aname) in local_tracks_map.items():
                if dedup_key not in seen_keys:
                    aimg = local_artist_images.get(dedup_key)
                    tracks.append(_track_to_response(t, aname, aimg))

            await db.commit()
            results["tracks"] = tracks

    if "playlists" in types:
        result = await db.execute(
            select(Playlist).where(
                Playlist.is_public == True, Playlist.title.ilike(like_pattern)
            ).offset(offset).limit(page_size)
        )
        results["playlists"] = [PlaylistResponse.model_validate(p) for p in result.scalars().all()]

    if "podcasts" in types:
        result = await db.execute(
            select(Podcast).where(Podcast.title.ilike(like_pattern)).offset(offset).limit(page_size)
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


@router.post("/download-deezer")
async def download_deezer_track(
    deezer_id: int,
    title: str,
    artist_name: str,
    preview_url: str,
    db: AsyncSession = Depends(get_db),
):
    """Download a Deezer preview to MinIO and create/update a local track."""
    object_name = f"deezer/previews/{deezer_id}.mp3"
    result = await download_deezer_preview(preview_url, object_name)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to download from Deezer"
        )
    
    from app.core.minio import get_file_url
    file_url = get_file_url(object_name)
    
    artist_id = await _ensure_artist(db, artist_name, None)
    
    existing = await db.execute(
        select(Track).where(Track.isrc.isnot(None), Track.isrc != "").limit(1)
    )
    
    track = Track(
        title=title,
        artist_id=artist_id,
        file_url=file_url,
        file_path=object_name,
        duration_seconds=30,
        cover_url=None,
    )
    db.add(track)
    await db.flush()
    await db.refresh(track)
    
    return {
        "track_id": str(track.id),
        "title": title,
        "artist": artist_name,
        "file_url": file_url,
        "message": "Downloaded and imported successfully"
    }
