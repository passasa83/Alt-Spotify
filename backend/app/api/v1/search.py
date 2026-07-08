from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track
from app.models.playlist import Playlist
from app.schemas.artist import ArtistResponse
from app.schemas.album import AlbumResponse
from app.schemas.track import TrackResponse
from app.schemas.playlist import PlaylistResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("tracks,artists,albums,playlists"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    types = [t.strip() for t in type.split(",")]
    offset = (page - 1) * page_size
    results: dict = {}

    if "artists" in types:
        result = await db.execute(
            select(Artist)
            .where(Artist.name.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        results["artists"] = [ArtistResponse.model_validate(a) for a in result.scalars().all()]

    if "albums" in types:
        result = await db.execute(
            select(Album)
            .where(Album.title.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        results["albums"] = [AlbumResponse.model_validate(a) for a in result.scalars().all()]

    if "tracks" in types:
        result = await db.execute(
            select(Track)
            .where(Track.title.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        results["tracks"] = [TrackResponse.model_validate(t) for t in result.scalars().all()]

    if "playlists" in types:
        result = await db.execute(
            select(Playlist)
            .where(Playlist.is_public == True, Playlist.title.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        results["playlists"] = [PlaylistResponse.model_validate(p) for p in result.scalars().all()]

    return results
