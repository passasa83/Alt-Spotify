from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.track import Track
from app.models.user import User
from app.services.tidal import tidal_client
from app.utils.deps import get_current_user

router = APIRouter(prefix="/tidal", tags=["tidal"])


@router.get("/search")
async def search_tidal(
    q: str = Query(..., min_length=1),
    type: str = Query("tracks,artists,albums,playlists"),
    limit: int = Query(20, ge=1, le=50),
):
    types = [t.strip() for t in type.split(",")]
    results: dict = {}

    if "tracks" in types:
        results["tracks"] = await tidal_client.search_tracks(q, limit=limit)
    if "artists" in types:
        results["artists"] = await tidal_client.search_artists(q, limit=limit)
    if "albums" in types:
        results["albums"] = await tidal_client.search_albums(q, limit=limit)
    if "playlists" in types:
        results["playlists"] = await tidal_client.search_playlists(q, limit=limit)

    return results


@router.get("/search/isrc")
async def search_by_isrc(isrc: str = Query(..., min_length=12, max_length=12)):
    result = await tidal_client.search_by_isrc(isrc)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found for this ISRC")
    return result


@router.get("/tracks/{track_id}")
async def get_track(track_id: int):
    result = await tidal_client.get_track_info(track_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    return result


@router.get("/albums/{album_id}")
async def get_album(album_id: int):
    result = await tidal_client.get_album(album_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    return result


@router.get("/artists/{artist_id}")
async def get_artist(artist_id: int):
    result = await tidal_client.get_artist(artist_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return result


@router.get("/artists/{artist_id}/discography")
async def get_artist_discography(
    artist_id: int,
    limit: int = Query(50, ge=1, le=200),
):
    result = await tidal_client.get_artist_discography(artist_id, limit=limit)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return result


@router.get("/artists/{artist_id}/similar")
async def get_similar_artists(
    artist_id: int,
    limit: int = Query(20, ge=1, le=50),
):
    results = await tidal_client.get_similar_artists(artist_id, limit=limit)
    return {"artists": results}


@router.get("/albums/{album_id}/similar")
async def get_similar_albums(
    album_id: int,
    limit: int = Query(20, ge=1, le=50),
):
    results = await tidal_client.get_similar_albums(album_id, limit=limit)
    return {"albums": results}


@router.get("/recommendations/{track_id}")
async def get_recommendations(track_id: int):
    results = await tidal_client.get_recommendations(track_id)
    return {"tracks": results}


@router.get("/mix/{mix_id}")
async def get_mix(mix_id: str):
    result = await tidal_client.get_mix(mix_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mix not found")
    return result


@router.get("/playlists/{playlist_id}")
async def get_playlist(
    playlist_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    result = await tidal_client.get_playlist(playlist_id, limit=limit)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    return result


@router.get("/tracks/{track_id}/stream")
async def get_stream_url(
    track_id: int,
    quality: str = Query("FLAC"),
):
    result = await tidal_client.get_stream_url(track_id, quality=quality)
    if not result:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to get stream URL from Tidal")

    flac_url = None
    if isinstance(result, dict):
        urls = result.get("urls", [])
        if urls:
            flac_url = urls[0]
        elif "url" in result:
            flac_url = result["url"]
        elif "manifest" in result:
            manifest = result["manifest"]
            if isinstance(manifest, str):
                import base64, json
                try:
                    decoded = json.loads(base64.b64decode(manifest))
                    urls = decoded.get("urls", [])
                    if urls:
                        flac_url = urls[0]
                except Exception:
                    pass

    if not flac_url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No stream URL in Tidal response")

    return RedirectResponse(url=flac_url, status_code=status.HTTP_302_FOUND)


@router.get("/tracks/{track_id}/manifest")
async def get_stream_manifest(
    track_id: int,
    quality: str = Query("FLAC"),
):
    result = await tidal_client.get_stream_manifest(track_id, quality=quality)
    if not result:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to get manifest from Tidal")
    return result


@router.get("/tracks/{track_id}/lyrics")
async def get_lyrics(track_id: int):
    lyrics = await tidal_client.get_lyrics(track_id)
    if not lyrics:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lyrics not found")
    return {"lyrics": lyrics}


@router.post("/enrich/{track_id}")
async def enrich_local_track(
    track_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    from uuid import UUID
    result = await db.execute(select(Track).where(Track.id == UUID(track_id)))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    tidal_track = None
    if track.isrc:
        tidal_track = await tidal_client.search_by_isrc(track.isrc)

    if not tidal_track:
        tidal_tracks = await tidal_client.search_tracks(f"{track.title} {track.artist_id}", limit=1)
        tidal_track = tidal_tracks[0] if tidal_tracks else None

    if not tidal_track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found on Tidal")

    updated_fields = []
    if tidal_track.get("replay_gain") and not track.track_gain:
        track.track_gain = tidal_track["replay_gain"]
        updated_fields.append("track_gain")
    if tidal_track.get("peak") and not track.track_peak:
        track.track_peak = tidal_track["peak"]
        updated_fields.append("track_peak")
    if tidal_track.get("bpm") and not track.bpm:
        track.bpm = tidal_track["bpm"]
        updated_fields.append("bpm")
    if tidal_track.get("key") and not track.key:
        track.key = tidal_track["key"]
        updated_fields.append("key")
    if tidal_track.get("isrc") and not track.isrc:
        track.isrc = tidal_track["isrc"]
        updated_fields.append("isrc")
    if tidal_track.get("cover_url") and not track.cover_url:
        track.cover_url = tidal_track["cover_url"]
        updated_fields.append("cover_url")

    if updated_fields:
        await db.commit()

    return {
        "track_id": str(track.id),
        "tidal_id": tidal_track.get("id"),
        "updated_fields": updated_fields,
        "tidal_data": tidal_track,
    }
