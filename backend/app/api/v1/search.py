from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track
from app.models.playlist import Playlist
from app.models.podcast import Podcast
from app.schemas.artist import ArtistResponse
from app.schemas.album import AlbumResponse
from app.schemas.track import TrackResponse
from app.schemas.playlist import PlaylistResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("tracks,artists,albums,playlists,podcasts"),
    genre: str | None = None,
    year: int | None = None,
    min_duration: int | None = None,
    max_duration: int | None = None,
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
        query = select(Album).where(Album.title.ilike(f"%{q}%"))
        result = await db.execute(query.offset(offset).limit(page_size))
        results["albums"] = [AlbumResponse.model_validate(a) for a in result.scalars().all()]

    if "tracks" in types:
        query = select(Track).where(Track.title.ilike(f"%{q}%"))
        if genre:
            query = query.where(Track.genre.ilike(genre))
        if min_duration is not None:
            query = query.where(Track.duration_seconds >= min_duration)
        if max_duration is not None:
            query = query.where(Track.duration_seconds <= max_duration)
        result = await db.execute(query.offset(offset).limit(page_size))
        results["tracks"] = [TrackResponse.model_validate(t) for t in result.scalars().all()]

    if "playlists" in types:
        result = await db.execute(
            select(Playlist)
            .where(Playlist.is_public == True, Playlist.title.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        results["playlists"] = [PlaylistResponse.model_validate(p) for p in result.scalars().all()]

    if "podcasts" in types:
        result = await db.execute(
            select(Podcast)
            .where(Podcast.title.ilike(f"%{q}%"))
            .offset(offset)
            .limit(page_size)
        )
        from app.schemas.podcast import PodcastResponse
        results["podcasts"] = [PodcastResponse.model_validate(p) for p in result.scalars().all()]

    return results
