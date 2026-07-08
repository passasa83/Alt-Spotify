import csv
import io
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.models.artist import Artist
from app.models.album import Album
from app.schemas.common import MessageResponse
from app.utils.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/playlists/import-export", tags=["import-export"])


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
