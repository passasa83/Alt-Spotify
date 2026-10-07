import csv
import io
import json
import uuid

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.album import Album
from app.models.artist import Artist
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.models.user import User
from app.services.artist_import import TRACK_QUEUE
from app.services.deezer import extract_playlist_id as extract_deezer_id
from app.services.deezer import fetch_deezer_playlist
from app.services.spotify import extract_playlist_id as extract_spotify_id
from app.services.spotify import fetch_spotify_playlist
from app.services.spotify import is_configured as spotify_configured
from app.utils.artist import ensure_artist
from app.utils.deps import get_current_user

logger = structlog.get_logger("app")

router = APIRouter(prefix="/playlists/import-export", tags=["import-export"])

# Missing Deezer tracks queued for download per import: enough to fill a
# playlist without hammering YouTube (the worker pauses between downloads).
MAX_DEEZER_AUTO_DOWNLOADS = 50


@router.get("/status")
async def import_status(
    _current_user: User = Depends(get_current_user),
):
    return {
        "spotify_configured": spotify_configured(),
        "deezer_available": True,
    }


async def _match_tracks(rows: list[dict], db: AsyncSession) -> tuple[list[Track], list[dict]]:
    matched: list[Track] = []
    unmatched: list[dict] = []

    for i, row in enumerate(rows):
        title = row.get("title", "").strip()
        artist_name = row.get("artist", "").strip()
        album_name = row.get("album", "").strip()

        if not title or not artist_name:
            unmatched.append({"row": i + 1, "reason": "Missing title or artist"})
            continue

        query = (
            select(Track)
            .join(Artist, Track.artist_id == Artist.id)
            .outerjoin(Album, Track.album_id == Album.id)
            .where(Track.title.ilike(f"%{title}%"))
            .where(Artist.name.ilike(f"%{artist_name}%"))
        )
        if album_name:
            query = query.where(Album.title.ilike(f"%{album_name}%"))

        result = await db.execute(query)
        track = result.scalars().first()

        if track:
            matched.append(track)
        else:
            unmatched.append({"row": i + 1, "reason": f"No match for '{title}' by '{artist_name}'"})

    return matched, unmatched


@router.post("/csv")
async def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    decoded = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))

    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    matched, unmatched = await _match_tracks(rows, db)

    playlist = Playlist(
        title=f"Imported from {file.filename}",
        owner_id=current_user.id,
        is_public=False,
    )
    db.add(playlist)
    await db.flush()

    for pos, track in enumerate(matched):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=pos,
            added_by=current_user.id,
        )
        db.add(pt)
    await db.flush()

    return {
        "playlist_id": str(playlist.id),
        "matched": len(matched),
        "unmatched": unmatched,
    }


@router.post("/json")
async def import_json(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a JSON")

    content = await file.read()
    try:
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="JSON must be an array of tracks")

    matched, unmatched = await _match_tracks(data, db)

    playlist = Playlist(
        title=f"Imported from {file.filename}",
        owner_id=current_user.id,
        is_public=False,
    )
    db.add(playlist)
    await db.flush()

    for pos, track in enumerate(matched):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=pos,
            added_by=current_user.id,
        )
        db.add(pt)
    await db.flush()

    return {
        "playlist_id": str(playlist.id),
        "matched": len(matched),
        "unmatched": unmatched,
    }


@router.get("/{playlist_id}/export/csv")
async def export_csv(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id and not playlist.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    tracks_result = await db.execute(
        select(Track, Artist.name, Album.title)
        .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
        .join(Artist, Track.artist_id == Artist.id)
        .outerjoin(Album, Track.album_id == Album.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    rows = tracks_result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "artist", "album"])
    for track, artist_name, album_title in rows:
        writer.writerow([track.title, artist_name, album_title or ""])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={playlist.title}.csv"},
    )


@router.get("/{playlist_id}/export/json")
async def export_json(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playlist).where(Playlist.id == playlist_id))
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.owner_id != current_user.id and not playlist.is_public:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    tracks_result = await db.execute(
        select(Track, Artist.name, Album.title)
        .join(PlaylistTrack, PlaylistTrack.track_id == Track.id)
        .join(Artist, Track.artist_id == Artist.id)
        .outerjoin(Album, Track.album_id == Album.id)
        .where(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position)
    )
    rows = tracks_result.all()

    data = []
    for track, artist_name, album_title in rows:
        data.append({
            "title": track.title,
            "artist": artist_name,
            "album": album_title or "",
        })

    content = json.dumps(data, indent=2)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={playlist.title}.json"},
    )


class SpotifyImportRequest(BaseModel):
    url: str


@router.post("/spotify")
async def import_from_spotify(
    body: SpotifyImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not spotify_configured():
        raise HTTPException(
            status_code=501,
            detail="Spotify import not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env file. Get credentials at https://developer.spotify.com/dashboard",
        )

    playlist_id = extract_spotify_id(body.url)
    if not playlist_id:
        raise HTTPException(status_code=400, detail="Invalid Spotify playlist URL")

    spotify_data = await fetch_spotify_playlist(playlist_id)
    if not spotify_data:
        raise HTTPException(status_code=502, detail="Failed to fetch Spotify playlist. Check your credentials and that the playlist is public.")

    playlist = Playlist(
        title=spotify_data["title"],
        description=spotify_data.get("description", ""),
        owner_id=current_user.id,
        is_public=True,
    )
    db.add(playlist)
    await db.flush()

    rows = [
        {"title": t["title"], "artist": t["artist"], "album": t["album"]}
        for t in spotify_data["tracks"]
    ]
    matched_tracks, unmatched_rows = await _match_tracks(rows, db)

    for i, track in enumerate(matched_tracks):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=i,
            added_by=current_user.id,
        )
        db.add(pt)

    await db.flush()
    await db.refresh(playlist)

    return {
        "playlist_id": str(playlist.id),
        "title": playlist.title,
        "matched": len(matched_tracks),
        "unmatched": len(unmatched_rows),
        "unmatched_tracks": unmatched_rows[:20],
        "total_spotify_tracks": spotify_data["track_count"],
    }


class DeezerImportRequest(BaseModel):
    url: str


@router.post("/deezer")
async def import_from_deezer(
    body: DeezerImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist_id = extract_deezer_id(body.url)
    if not playlist_id:
        raise HTTPException(status_code=400, detail="Invalid Deezer playlist URL")

    deezer_data = await fetch_deezer_playlist(playlist_id)
    if not deezer_data:
        raise HTTPException(status_code=502, detail="Failed to fetch Deezer playlist")

    playlist = Playlist(
        title=deezer_data["title"],
        description=deezer_data.get("description", ""),
        owner_id=current_user.id,
        is_public=True,
    )
    db.add(playlist)
    await db.flush()

    rows = [
        {"title": t["title"], "artist": t["artist"], "album": t["album"], "duration": t.get("duration", 0)}
        for t in deezer_data["tracks"]
    ]
    matched_tracks, unmatched_rows = await _match_tracks(rows, db)

    # Missing tracks are not just skipped: stub rows are created, added to
    # the playlist and queued for download (YouTube, background worker), so
    # the playlist fills up on its own after the import.
    missing_rows = [rows[u["row"] - 1] for u in unmatched_rows if 0 < u["row"] <= len(rows)]
    missing_rows = [
        r for r in missing_rows
        if (r.get("title") or "").strip() and (r.get("artist") or "").strip()
    ]
    download_tracks: list[Track] = []
    for entry in missing_rows[:MAX_DEEZER_AUTO_DOWNLOADS]:
        artist_id = await ensure_artist(db, entry["artist"].strip(), None)
        stub = Track(
            title=entry["title"].strip(),
            artist_id=artist_id,
            duration_seconds=entry.get("duration") or 0,
        )
        db.add(stub)
        download_tracks.append(stub)
    await db.flush()

    all_tracks = [*matched_tracks, *download_tracks]
    for i, track in enumerate(all_tracks):
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=i,
            added_by=current_user.id,
        )
        db.add(pt)

    await db.flush()
    await db.refresh(playlist)

    queued_for_download = 0
    if download_tracks:
        try:
            from app.core.redis import get_redis

            redis = await get_redis()
            for stub in download_tracks:
                await redis.rpush(
                    TRACK_QUEUE,
                    json.dumps({"track_id": str(stub.id), "deezer_id": f"playlist:{playlist.id}"}),
                )
            queued_for_download = len(download_tracks)
        except Exception as e:  # noqa: BLE001
            # Redis down: the stubs stay in the playlist and can be
            # downloaded later; the import itself still succeeded.
            logger.warning("deezer_import_queue_failed", error=str(e))

    return {
        "playlist_id": str(playlist.id),
        "title": playlist.title,
        "matched": len(matched_tracks),
        "unmatched": len(unmatched_rows),
        "unmatched_tracks": unmatched_rows[:20],
        "total_deezer_tracks": deezer_data["track_count"],
        "queued_for_download": queued_for_download,
    }
