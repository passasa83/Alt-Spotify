import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.track import Track

router = APIRouter(prefix="/lyrics", tags=["lyrics"])

LRC_LINE_RE = re.compile(r"\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)")


def parse_lrc(lrc_text: str) -> list[dict]:
    lines = []
    for match in LRC_LINE_RE.finditer(lrc_text):
        minutes = int(match.group(1))
        seconds = int(match.group(2))
        frac = match.group(3)
        if len(frac) == 2:
            frac = frac + "0"
        milliseconds = int(frac)
        time_seconds = minutes * 60 + seconds + milliseconds / 1000.0
        text = match.group(4).strip()
        if text:
            lines.append({"time_seconds": round(time_seconds, 3), "text": text})
    lines.sort(key=lambda x: x["time_seconds"])
    return lines


@router.get("/{track_id}")
async def get_lyrics(track_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not track.lyrics_lrc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No lyrics available")
    return {"track_id": str(track_id), "lyrics_lrc": track.lyrics_lrc}


@router.get("/{track_id}/parsed")
async def get_parsed_lyrics(track_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not track.lyrics_lrc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No lyrics available")
    parsed = parse_lrc(track.lyrics_lrc)
    return {"track_id": str(track_id), "lines": parsed}
