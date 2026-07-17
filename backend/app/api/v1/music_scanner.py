import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from mutagen import File as MutagenFile
import structlog

from app.core.database import get_db
from app.models.track import Track
from app.models.artist import Artist
from app.models.user import User
from app.utils.deps import require_admin

logger = structlog.get_logger("app")

router = APIRouter(prefix="/scan", tags=["scan"])

AUDIO_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus", ".wma", ".alac"}


def extract_metadata(file_path: str) -> dict:
    """Extract metadata from an audio file using mutagen."""
    metadata = {}
    replay_gain = None
    track_peak = None

    try:
        audio = MutagenFile(file_path, easy=True)
        if audio:
            metadata = {
                "title": (audio.get("title", [None]) or [None])[0],
                "artist": (audio.get("artist", [None]) or [None])[0],
                "album": (audio.get("album", [None]) or [None])[0],
                "genre": (audio.get("genre", [None]) or [None])[0],
                "duration": audio.info.length if audio.info else 0,
            }
        audio_full = MutagenFile(file_path)
        if audio_full and hasattr(audio_full, "tags") and audio_full.tags:
            for tag_key in ["REPLAYGAIN_TRACK_GAIN", "R128_TRACK_GAIN"]:
                if tag_key in audio_full.tags:
                    val = str(audio_full.tags[tag_key][0]).replace(" dB", "").replace("dB", "")
                    try:
                        replay_gain = float(val)
                        break
                    except ValueError:
                        pass
            for tag_key in ["REPLAYGAIN_TRACK_PEAK", "TXXX:REPLAYGAIN_TRACK_PEAK"]:
                if tag_key in audio_full.tags:
                    try:
                        track_peak = float(str(audio_full.tags[tag_key][0]))
                        break
                    except (ValueError, KeyError):
                        pass
    except Exception:
        pass

    metadata["replay_gain"] = replay_gain
    metadata["track_peak"] = track_peak
    return metadata


async def find_or_create_artist(db: AsyncSession, name: str) -> Artist:
    result = await db.execute(select(Artist).where(Artist.name.ilike(name)))
    artist = result.scalars().first()
    if not artist:
        artist = Artist(name=name)
        db.add(artist)
        await db.flush()
    return artist


@router.post("")
async def scan_directory(
    directory: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    scan_dir = directory or os.environ.get("MUSIC_SCAN_DIR", "/music")
    if not os.path.isdir(scan_dir):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Directory not found: {scan_dir}",
        )

    audio_files = []
    for root, _dirs, files in os.walk(scan_dir):
        for f in files:
            if Path(f).suffix.lower() in AUDIO_EXTENSIONS:
                audio_files.append(os.path.join(root, f))

    if not audio_files:
        return {"scanned": 0, "imported": 0, "skipped": 0, "message": "No audio files found"}

    imported = 0
    skipped = 0

    for file_path in audio_files:
        filename = os.path.basename(file_path)

        existing = await db.execute(
            select(Track).where(Track.file_url == f"local:{file_path}")
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        metadata = extract_metadata(file_path)
        title = metadata.get("title") or Path(filename).stem
        duration = int(metadata.get("duration", 0)) if metadata.get("duration") else 0

        artist_name = metadata.get("artist")
        if not artist_name:
            parts = filename.rsplit(".", 1)[0]
            if " - " in parts:
                artist_name, title = parts.split(" - ", 1)

        artist = None
        if artist_name:
            artist = await find_or_create_artist(db, artist_name)
        else:
            artist = await find_or_create_artist(db, "Unknown Artist")

        track = Track(
            id=uuid.uuid4(),
            title=title.strip(),
            artist_id=artist.id,
            duration_seconds=duration,
            file_url=f"local:{file_path}",
            genre=metadata.get("genre"),
            track_gain=metadata.get("replay_gain"),
            track_peak=metadata.get("track_peak"),
            is_explicit=False,
        )
        db.add(track)
        imported += 1

    await db.commit()

    logger.info("music_scan_completed", scanned=len(audio_files), imported=imported, skipped=skipped)

    return {
        "scanned": len(audio_files),
        "imported": imported,
        "skipped": skipped,
        "directory": scan_dir,
    }
