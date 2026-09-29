import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.track import Track
from app.models.user import User


async def get_track_for_user(track_id: uuid.UUID, current_user: User, db: AsyncSession) -> Track:
    """Load a track, enforcing territory and child-account restrictions."""
    result = await db.execute(
        select(Track)
        .options(selectinload(Track.artist), selectinload(Track.album))
        .where(Track.id == track_id)
    )
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    if track.allowed_territories:
        if not current_user.country or current_user.country not in track.allowed_territories:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Track not available in your territory")

    if current_user.is_child_account and track.is_explicit:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Explicit content is restricted for child accounts")

    return track
