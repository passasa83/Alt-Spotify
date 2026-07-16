import re
import httpx

DEEZER_API_BASE = "https://api.deezer.com"


def extract_playlist_id(url: str) -> str | None:
    patterns = [
        r"deezer\.com/playlist/(\d+)",
        r"deezer:playlist:(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def fetch_deezer_playlist(playlist_id: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{DEEZER_API_BASE}/playlist/{playlist_id}")
        if resp.status_code != 200:
            return None
        data = resp.json()

        if "error" in data:
            return None

        all_tracks = []
        tracks_data = data.get("tracks", {}).get("data", [])
        for item in tracks_data:
            title = item.get("title", "")
            artist_name = item.get("artist", {}).get("name", "")
            album_title = item.get("album", {}).get("title", "")
            duration = item.get("duration", 0)
            if title:
                all_tracks.append({
                    "title": title,
                    "artist": artist_name,
                    "album": album_title,
                    "duration_seconds": duration,
                    "is_explicit": item.get("explicit_lyrics", False),
                    "deezer_url": item.get("link", ""),
                })

        return {
            "title": data.get("title", "Imported from Deezer"),
            "description": data.get("description", ""),
            "image": data.get("picture_xl") or data.get("picture_big") or data.get("picture"),
            "track_count": data.get("nb_tracks", len(all_tracks)),
            "tracks": all_tracks,
        }
