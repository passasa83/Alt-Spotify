import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artist import Artist


async def ensure_artist(db: AsyncSession, name: str, image_url: str | None = None) -> uuid.UUID:
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
