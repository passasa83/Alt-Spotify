import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from mutagen import File as MutagenFile
import structlog

from app.core.database import get_db
from app.models.track import Track
from app.models.artist import Artist
from app.models.album import Album
from app.models.user import User
from app.utils.deps import require_admin, get_current_user_from_header_or_query

logger = structlog.get_logger("app")

router = APIRouter(tags=["local"])

AUDIO_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus", ".wma", ".alac"}
COVER_NAMES = {"cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "front.png", "album.jpg", "album.png"}


def parse_lrc(content: str) -> str:
    """Convert LRC content to simple [mm:ss.xx] text format for storage."""
    lines = []
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.match(r"\[(\d+):(\d+)\.(\d+)\](.*)", line)
        if match:
            minutes, seconds, hundredths, text = match.groups()
            if text.strip():
                lines.append(f"[{int(minutes):02d}:{int(seconds):02d}.{hundredths}]{text.strip()}")
    return "\n".join(lines)


def find_lrc_for_audio(audio_path: str) -> str | None:
    """Find and read a .lrc file that corresponds to an audio file."""
    audio_stem = Path(audio_path).stem
    audio_dir = Path(audio_path).parent

    for candidate in [
        audio_dir / f"{audio_stem}.lrc",
        audio_dir / f"{audio_stem}.LRC",
    ]:
        if candidate.is_file():
            try:
                content = candidate.read_text(encoding="utf-8", errors="replace")
                parsed = parse_lrc(content)
                if parsed:
                    return parsed
            except Exception:
                pass

    for f in audio_dir.iterdir():
        if f.suffix.lower() == ".lrc" and f.stem.lower() == audio_stem.lower():
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                parsed = parse_lrc(content)
                if parsed:
                    return parsed
            except Exception:
                pass

    return None


def find_cover_in_dir(directory: str) -> str | None:
    """Find cover image in a directory."""
    dir_path = Path(directory).resolve()
    for name in COVER_NAMES:
        candidate = dir_path / name
        if candidate.is_file():
            return str(candidate)
    return None


def parse_filename(filename: str) -> dict:
    """Parse 'NN - Artist - Title.ext' or 'Artist - Title.ext' patterns."""
    stem = Path(filename).stem

    match = re.match(r"^\d+\s*-\s*(.+)\s+-\s+(.+)$", stem)
    if match:
        return {"artist": match.group(1).strip(), "title": match.group(2).strip()}

    parts = stem.split(" - ", 1)
    if len(parts) == 2:
        return {"artist": parts[0].strip(), "title": parts[1].strip()}

    return {}


async def scan_directory_internal(scan_dir: str, db: AsyncSession) -> dict:
    """Internal scan function called at startup (no auth required)."""
    if not os.path.isdir(scan_dir):
        logger.warning("scan_dir_not_found", path=scan_dir)
        return {"scanned": 0, "imported": 0, "skipped": 0, "error": f"Directory not found: {scan_dir}"}

    audio_files = []
    for root, _dirs, files in os.walk(scan_dir):
        for f in files:
            if Path(f).suffix.lower() in AUDIO_EXTENSIONS:
                audio_files.append(os.path.join(root, f))

    logger.info("scan_found_files", count=len(audio_files), scan_dir=scan_dir)

    if not audio_files:
        return {"scanned": 0, "imported": 0, "skipped": 0, "message": "No audio files found"}

    imported = 0
    skipped = 0
    errors = 0

    for file_path in audio_files:
        try:
            filename = os.path.basename(file_path)

            metadata = extract_metadata(file_path)
            duration = int(metadata.get("duration", 0)) if metadata.get("duration") else 0

            artist_name = metadata.get("artist")
            title = metadata.get("title")
            album_name = metadata.get("album")

            parsed = parse_filename(filename)
            if not artist_name and parsed.get("artist"):
                artist_name = parsed["artist"]
            if not title and parsed.get("title"):
                title = parsed["title"]
            if not title:
                title = Path(filename).stem

            artist = await find_or_create_artist(db, (artist_name or "Unknown Artist").strip())

            existing = await db.execute(
                select(Track).where(
                    Track.title.ilike(title.strip()),
                    Track.artist_id == artist.id,
                ).limit(1)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            album = None
            if album_name:
                album = await find_or_create_album(db, album_name.strip(), artist.id)

            lrc_content = find_lrc_for_audio(file_path)

            from app.services.cover_service import fetch_cover
            api_cover = await fetch_cover(title.strip(), (artist_name or "").strip())

            track = Track(
                id=uuid.uuid4(),
                title=title.strip(),
                artist_id=artist.id,
                album_id=album.id if album else None,
                duration_seconds=duration,
                file_url=f"local:{file_path}",
                cover_url=api_cover,
                genre=metadata.get("genre"),
                track_gain=metadata.get("replay_gain"),
                track_peak=metadata.get("track_peak"),
                lyrics_lrc=lrc_content,
                is_explicit=False,
            )
            db.add(track)
            imported += 1
        except Exception as e:
            errors += 1
            logger.warning("scan_file_error", file=file_path, error=str(e))

    await db.commit()

    logger.info(
        "music_scan_completed",
        scanned=len(audio_files),
        imported=imported,
        skipped=skipped,
        errors=errors,
    )

    return {
        "scanned": len(audio_files),
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "directory": scan_dir,
    }


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


async def find_or_create_album(db: AsyncSession, name: str, artist_id: uuid.UUID) -> Album:
    result = await db.execute(
        select(Album).where(Album.title.ilike(name), Album.artist_id == artist_id)
    )
    album = result.scalars().first()
    if not album:
        album = Album(title=name, artist_id=artist_id)
        db.add(album)
        await db.flush()
    return album


@router.post("/scan")
async def scan_directory(
    directory: str | None = Query(None, description="Directory to scan for music files"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    scan_dir = directory or os.environ.get("MUSIC_SCAN_DIR", "/music")
    result = await scan_directory_internal(scan_dir, db)
    if result.get("error"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"],
        )
    return result


@router.post("/fix-covers")
async def fix_covers(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Replace all local_cover: URLs with API-fetched cover art."""
    from app.services.cover_service import fetch_cover
    from app.models.artist import Artist

    result = await db.execute(select(Track).where((Track.cover_url.is_(None)) | (Track.cover_url.like("local_cover:%"))))
    tracks = list(result.scalars().all())

    if not tracks:
        return {"total": 0, "fixed": 0, "cleared": 0}

    artist_ids = list({t.artist_id for t in tracks if t.artist_id})
    artist_result = await db.execute(select(Artist).where(Artist.id.in_(artist_ids)))
    artist_map = {str(a.id): a.name for a in artist_result.scalars().all()}

    fixed = 0
    cleared = 0
    for track in tracks:
        artist_name = artist_map.get(str(track.artist_id), "")
        api_cover = await fetch_cover(track.title, artist_name)
        if api_cover:
            track.cover_url = api_cover
            fixed += 1
        else:
            track.cover_url = None
            cleared += 1

    await db.commit()
    return {"total": len(tracks), "fixed": fixed, "cleared": cleared}


@router.get("/local/covers/{cover_path:path}")
async def serve_local_cover(
    cover_path: str,
    _user: User = Depends(get_current_user_from_header_or_query),
):
    candidates = []

    full_path = os.path.normpath(f"/{cover_path}")
    candidates.append(full_path)

    if full_path.startswith("/app/downloads/"):
        candidates.append("/music" + full_path[len("/app/downloads"):])
    elif full_path.startswith("/music/"):
        candidates.append("/app/downloads" + full_path[len("/music"):])

    if cover_path.startswith("app/downloads/"):
        candidates.append("/music/" + cover_path[len("app/downloads/"):])
    elif not cover_path.startswith("/"):
        candidates.append("/music/" + cover_path)

    for path in candidates:
        path = os.path.normpath(path)
        if os.path.isfile(path):
            return FileResponse(path, media_type="image/jpeg")

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cover not found")
