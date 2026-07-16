import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger("app")

MEILI_URL = getattr(settings, "MEILISEARCH_URL", "http://meilisearch:7700")
MEILI_KEY = getattr(settings, "MEILISEARCH_MASTER_KEY", "changeme")


async def _headers():
    return {
        "Authorization": f"Bearer {MEILI_KEY}",
        "Content-Type": "application/json",
    }


async def ensure_indexes():
    async with httpx.AsyncClient() as client:
        headers = await _headers()
        existing = await client.get(f"{MEILI_URL}/indexes", headers=headers)
        existing_names = {idx["uid"] for idx in existing.json().get("results", [])}

        for index_name in ["tracks", "artists", "albums", "playlists", "podcasts"]:
            if index_name not in existing_names:
                resp = await client.post(
                    f"{MEILI_URL}/indexes",
                    headers=headers,
                    json={"uid": index_name, "primaryKey": "id"},
                )
                logger.info("meilisearch_index_created", index=index_name, status=resp.status_code)
            else:
                logger.info("meilisearch_index_exists", index=index_name)


async def reindex_all():
    """Reindex all data from the database into Meilisearch."""
    from app.core.database import async_session
    from app.models.track import Track
    from app.models.artist import Artist
    from app.models.album import Album
    from sqlalchemy import select

    async with async_session() as db:
        async with httpx.AsyncClient() as client:
            headers = await _headers()

            tracks = (await db.execute(select(Track))).scalars().all()
            if tracks:
                track_docs = []
                for t in tracks:
                    artist = None
                    if t.artist_id:
                        a = (await db.execute(select(Artist).where(Artist.id == t.artist_id))).scalar_one_or_none()
                        artist = a.name if a else None
                    track_docs.append({
                        "id": str(t.id),
                        "title": t.title,
                        "artist": artist or "",
                        "genre": t.genre or "",
                        "bpm": t.bpm,
                        "key": t.key or "",
                        "mood": t.mood or "",
                        "duration_seconds": t.duration_seconds or 0,
                        "lyrics_lrc": t.lyrics_lrc or "",
                    })
                await client.post(
                    f"{MEILI_URL}/indexes/tracks/documents",
                    headers=headers,
                    json=track_docs,
                )
                logger.info("meilisearch_reindexed", index="tracks", count=len(track_docs))

            artists = (await db.execute(select(Artist))).scalars().all()
            if artists:
                artist_docs = [{"id": str(a.id), "name": a.name, "bio": a.bio or ""} for a in artists]
                await client.post(
                    f"{MEILI_URL}/indexes/artists/documents",
                    headers=headers,
                    json=artist_docs,
                )
                logger.info("meilisearch_reindexed", index="artists", count=len(artist_docs))

            albums = (await db.execute(select(Album))).scalars().all()
            if albums:
                album_docs = [{"id": str(a.id), "title": a.title, "artist_id": str(a.artist_id) if a.artist_id else ""} for a in albums]
                await client.post(
                    f"{MEILI_URL}/indexes/albums/documents",
                    headers=headers,
                    json=album_docs,
                )
                logger.info("meilisearch_reindexed", index="albums", count=len(album_docs))


async def index_track(track_data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{MEILI_URL}/indexes/tracks/documents",
            headers=await _headers(),
            json=[track_data],
        )


async def index_artist(artist_data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{MEILI_URL}/indexes/artists/documents",
            headers=await _headers(),
            json=[artist_data],
        )


async def index_album(album_data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{MEILI_URL}/indexes/albums/documents",
            headers=await _headers(),
            json=[album_data],
        )


async def index_playlist(playlist_data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{MEILI_URL}/indexes/playlists/documents",
            headers=await _headers(),
            json=[playlist_data],
        )


async def index_podcast(podcast_data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{MEILI_URL}/indexes/podcasts/documents",
            headers=await _headers(),
            json=[podcast_data],
        )


async def search_meili(query: str, index: str = "tracks", limit: int = 20, offset: int = 0, filter: str | None = None):
    async with httpx.AsyncClient() as client:
        body: dict = {"q": query, "limit": limit, "offset": offset}
        if filter:
            body["filter"] = filter
        resp = await client.post(
            f"{MEILI_URL}/indexes/{index}/search",
            headers=await _headers(),
            json=body,
        )
        return resp.json().get("hits", [])


async def delete_from_index(index: str, doc_id: str):
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{MEILI_URL}/indexes/{index}/documents/{doc_id}",
            headers=await _headers(),
        )
