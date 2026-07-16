import httpx
import re
import base64
from app.core.config import settings

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_OEMBED_URL = "https://open.spotify.com/oembed"


def extract_playlist_id(url: str) -> str | None:
    patterns = [
        r"open\.spotify\.com/playlist/([a-zA-Z0-9]+)",
        r"spotify:playlist:([a-zA-Z0-9]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def get_client_credentials_token() -> str | None:
    client_id = getattr(settings, "SPOTIFY_CLIENT_ID", None)
    client_secret = getattr(settings, "SPOTIFY_CLIENT_SECRET", None)
    if not client_id or not client_secret:
        return None

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            SPOTIFY_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {credentials}"},
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
    return None


async def get_playlist_oembed(playlist_id: str) -> dict | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SPOTIFY_OEMBED_URL}?url=https://open.spotify.com/playlist/{playlist_id}"
        )
        if resp.status_code == 200:
            return resp.json()
    return None


async def fetch_spotify_playlist(playlist_id: str) -> dict | None:
    token = await get_client_credentials_token()
    if not token:
        return None

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SPOTIFY_API_BASE}/playlists/{playlist_id}",
            headers=headers,
        )
        if resp.status_code != 200:
            return None
        playlist_data = resp.json()

        all_tracks = []
        tracks_url = playlist_data.get("tracks", {}).get("href")
        while tracks_url:
            tracks_resp = await client.get(tracks_url, headers=headers)
            if tracks_resp.status_code != 200:
                break
            tracks_page = tracks_resp.json()
            for item in tracks_page.get("items", []):
                track = item.get("track")
                if track and track.get("name"):
                    artists = [a.get("name", "") for a in track.get("artists", [])]
                    album_name = track.get("album", {}).get("name", "")
                    duration_ms = track.get("duration_ms", 0)
                    all_tracks.append({
                        "title": track["name"],
                        "artist": ", ".join(artists),
                        "album": album_name,
                        "duration_seconds": duration_ms // 1000,
                        "is_explicit": track.get("explicit", False),
                        "spotify_url": track.get("external_urls", {}).get("spotify", ""),
                    })
            tracks_url = tracks_page.get("next")

    return {
        "title": playlist_data.get("name", "Imported from Spotify"),
        "description": playlist_data.get("description", ""),
        "image": playlist_data.get("images", [{}])[0].get("url") if playlist_data.get("images") else None,
        "track_count": len(all_tracks),
        "tracks": all_tracks,
    }
