import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.playlist import Playlist


async def ensure_liked_playlist(db: AsyncSession, user_id: uuid.UUID) -> Playlist:
    result = await db.execute(
        select(Playlist).where(Playlist.owner_id == user_id, Playlist.title == "Liked Songs")
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    playlist = Playlist(
        title="Liked Songs",
        owner_id=user_id,
        description="Your liked songs",
        is_public=False,
    )
    db.add(playlist)
    await db.flush()
    await db.refresh(playlist)
    return playlist
