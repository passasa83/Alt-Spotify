import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from mutagen import File as MutagenFile
import structlog

from app.core.database import get_db
from app.core.minio import upload_file
from app.models.track import Track
from app.models.user import User
from app.utils.deps import require_admin

logger = structlog.get_logger("app")

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/flac", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/opus", "audio/x-ms-wma", "audio/alac", "audio/x-aac", "video/mp4"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AUDIO_SIZE = 100 * 1024 * 1024  # 100MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/audio", status_code=status.HTTP_202_ACCEPTED)
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = None,
    artist: str | None = None,
    artist_id: uuid.UUID | None = None,
    album_id: uuid.UUID | None = None,
    genre: str | None = None,
    is_explicit: bool = False,
    allowed_territories: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    file_data = await file.read()
    if len(file_data) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file too large (max 100MB)",
        )

    track_id = uuid.uuid4()
    ext = Path(file.filename or "audio.mp3").suffix or ".mp3"
    object_name = f"audio/{track_id}{ext}"

    upload_file(object_name, file_data, file.content_type or "audio/mpeg")

    # Extract metadata with mutagen
    metadata = {}
    replay_gain = None
    track_peak = None
    try:
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        try:
            audio = MutagenFile(tmp_path, easy=True)
            if audio:
                metadata = {
                    "title": audio.get("title", [None])[0],
                    "artist": audio.get("artist", [None])[0],
                    "album": audio.get("album", [None])[0],
                    "genre": audio.get("genre", [None])[0],
                    "duration": audio.info.length if audio.info else 0,
                }
            audio_full = MutagenFile(tmp_path)
            if audio_full and hasattr(audio_full, 'tags'):
                for tag_key in ['REPLAYGAIN_TRACK_GAIN', 'R128_TRACK_GAIN']:
                    if tag_key in audio_full.tags:
                        val = str(audio_full.tags[tag_key][0]).replace(' dB', '').replace('dB', '')
                        try:
                            replay_gain = float(val)
                            break
                        except ValueError:
                            pass
                for tag_key in ['REPLAYGAIN_TRACK_PEAK', 'TXXX:REPLAYGAIN_TRACK_PEAK']:
                    if tag_key in audio_full.tags:
                        try:
                            track_peak = float(str(audio_full.tags[tag_key][0]))
                            break
                        except (ValueError, KeyError):
                            pass
        finally:
            os.unlink(tmp_path)
    except Exception:
        pass

    final_title = title or metadata.get("title") or file.filename or "Untitled"
    duration = int(metadata.get("duration", 0)) if metadata.get("duration") else 0
    
    territories_list = None
    if allowed_territories:
        territories_list = [t.strip().upper() for t in allowed_territories.split(",") if t.strip()]
        
    final_artist_name = artist or metadata.get("artist")
    
    if not artist_id and final_artist_name:
        from app.models.artist import Artist
        from sqlalchemy import select
        result = await db.execute(select(Artist).where(Artist.name.ilike(final_artist_name)))
        found_artist = result.scalars().first()
        if not found_artist:
            found_artist = Artist(name=final_artist_name)
            db.add(found_artist)
            await db.flush()
        artist_id = found_artist.id

    if not artist_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Artist ID or Artist Name is required",
        )

    track = Track(
        id=track_id,
        title=final_title,
        artist_id=artist_id,
        album_id=album_id,
        duration_seconds=duration,
        file_url=object_name,
        genre=genre or metadata.get("genre"),
        is_explicit=is_explicit,
        allowed_territories=territories_list,
        track_gain=replay_gain,
        track_peak=track_peak,
    )
    db.add(track)
    await db.flush()
    await db.refresh(track)

    logger.info(
        "audio_uploaded",
        track_id=str(track.id),
        user_id=str(_admin.id),
        file_size=len(file_data),
        file_type=file.content_type,
    )

    # Trigger Celery transcoding task
    try:
        from worker.tasks import transcode_audio
        transcode_audio.delay(object_name, f"hls/{track_id}", str(track_id))
    except Exception as e:
        logger.warning("celery_transcode_dispatch_failed", error=str(e))

    return {
        "track_id": str(track.id),
        "status": "processing",
        "message": "Audio uploaded, transcoding started",
    }


@router.post("/cover", status_code=status.HTTP_201_CREATED)
async def upload_cover(
    file: UploadFile = File(...),
    entity_type: str = "track",
    entity_id: uuid.UUID | None = None,
    _admin: User = Depends(require_admin),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {file.content_type}",
        )

    file_data = await file.read()
    if len(file_data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file too large (max 10MB)",
        )

    ext = Path(file.filename or "cover.jpg").suffix or ".jpg"
    object_name = f"covers/{entity_type}/{entity_id}{ext}"

    upload_file(object_name, file_data, file.content_type or "image/jpeg")

    return {
        "url": object_name,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
    }


@router.get("/status/{task_id}")
async def get_upload_status(task_id: str):
    try:
        from worker.celery_app import app as celery_app
        result = celery_app.AsyncResult(task_id)
        return {
            "task_id": task_id,
            "status": result.state,
            "result": str(result.result) if result.result else None,
        }
    except Exception:
        return {
            "task_id": task_id,
            "status": "UNKNOWN",
            "result": None,
        }


ALLOWED_LYRICS_TYPES = {"text/plain", "application/octet-stream", "application/x-subrip"}


@router.post("/lyrics/{track_id}", status_code=status.HTTP_201_CREATED)
async def upload_lyrics(
    track_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    file_data = await file.read()
    if len(file_data) > 512 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Lyrics file too large (max 512KB)",
        )

    try:
        lrc_text = file_data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            lrc_text = file_data.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot decode lyrics file. Please use UTF-8 or Latin-1 encoded .lrc files.",
            )

    track.lyrics_lrc = lrc_text
    await db.flush()

    return {
        "track_id": str(track.id),
        "message": "Lyrics uploaded successfully",
        "lines_count": len([l for l in lrc_text.splitlines() if l.strip().startswith("[")]),
    }
