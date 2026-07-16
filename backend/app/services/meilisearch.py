import httpx
from app.core.config import settings

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
                await client.post(
                    f"{MEILI_URL}/indexes",
                    headers=headers,
                    json={"uid": index_name, "primaryKey": "id"},
                )


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
