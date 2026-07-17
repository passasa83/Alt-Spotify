import httpx
import base64
import json
import structlog

logger = structlog.get_logger("app")

TIDAL_ENDPOINTS = [
    "https://eu-central.monochrome.tf",
    "https://us-west.monochrome.tf",
    "https://api.monochrome.tf",
    "https://monochrome-api.samidy.com",
]

TIMEOUT = 15.0


class TidalClient:
    def __init__(self, endpoints: list[str] | None = None):
        self.endpoints = endpoints or TIDAL_ENDPOINTS
        self._active_endpoint: str | None = None

    async def _request(self, path: str, params: dict | None = None) -> dict | None:
        endpoints_to_try = (
            [self._active_endpoint] + [e for e in self.endpoints if e != self._active_endpoint]
            if self._active_endpoint
            else self.endpoints
        )
        for base_url in endpoints_to_try:
            url = f"{base_url}{path}"
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 200:
                        self._active_endpoint = base_url
                        data = resp.json()
                        if "data" in data:
                            return data["data"]
                        return data
                    logger.warning("tidal_request_failed", url=url, status=resp.status_code)
            except Exception as e:
                logger.warning("tidal_request_error", url=url, error=str(e))
        logger.error("tidal_all_endpoints_failed", path=path)
        return None

    async def search_tracks(self, query: str, limit: int = 20) -> list[dict]:
        data = await self._request("/search/", {"s": query, "limit": min(limit, 50)})
        if not data:
            return []
        items = data.get("items", []) if isinstance(data, dict) else []
        tracks = [t for t in items if "album" in t and "duration" in t]
        return [self._normalize_track(t) for t in tracks[:limit]]

    async def search_artists(self, query: str, limit: int = 20) -> list[dict]:
        data = await self._request("/search/", {"s": query, "limit": min(limit, 50)})
        if not data:
            return []
        items = data.get("items", []) if isinstance(data, dict) else []
        seen_ids = set()
        artists = []
        for t in items:
            artist = t.get("artist") or {}
            aid = artist.get("id")
            if aid and aid not in seen_ids:
                seen_ids.add(aid)
                artists.append(self._normalize_artist(artist))
        return artists[:limit]

    async def search_albums(self, query: str, limit: int = 20) -> list[dict]:
        data = await self._request("/search/", {"s": query, "limit": min(limit * 2, 50)})
        if not data:
            return []
        items = data.get("items", []) if isinstance(data, dict) else []
        seen_ids = set()
        albums = []
        for t in items:
            album = t.get("album") or {}
            aid = album.get("id")
            if aid and aid not in seen_ids:
                seen_ids.add(aid)
                artists = t.get("artists", [])
                artist_name = artists[0].get("name", "") if artists else ""
                albums.append(self._normalize_album(album, artist_name=artist_name))
        return albums[:limit]

    async def search_playlists(self, query: str, limit: int = 20) -> list[dict]:
        data = await self._request("/search/", {"p": query, "limit": min(limit, 50)})
        if not data:
            return []
        items = data.get("items", []) if isinstance(data, dict) else []
        return [self._normalize_playlist(p) for p in items[:limit]]

    async def search_by_isrc(self, isrc: str) -> dict | None:
        data = await self._request("/search/", {"i": isrc, "limit": 1})
        if not data:
            return None
        items = data.get("items", []) if isinstance(data, dict) else []
        if items:
            return self._normalize_track(items[0])
        return None

    async def get_track_info(self, track_id: int) -> dict | None:
        data = await self._request("/info/", {"id": track_id})
        if not data:
            return None
        return self._normalize_track(data)

    async def get_artist(self, artist_id: int) -> dict | None:
        data = await self._request("/artist/", {"id": artist_id})
        if not data:
            return None
        artist_data = data.get("artist", data)
        cover_data = data.get("cover", {})
        picture_url = None
        if isinstance(cover_data, dict) and "750" in cover_data:
            picture_url = cover_data["750"]
        elif artist_data.get("picture"):
            picture_url = f"https://resources.tidal.com/images/{artist_data['picture'].replace('-', '/')}/750x750.jpg"
        return {
            "id": artist_data.get("id"),
            "name": artist_data.get("name", ""),
            "picture_url": picture_url,
            "popularity": artist_data.get("popularity", 0),
            "url": artist_data.get("url"),
        }

    async def get_artist_discography(self, artist_id: int, limit: int = 50) -> dict | None:
        data = await self._request("/artist/", {"f": artist_id, "limit": min(limit, 50)})
        if not data:
            return None
        artist = data.get("artist", {})
        raw_albums = data.get("albums", {})
        if isinstance(raw_albums, dict):
            raw_albums = raw_albums.get("items", [])
        elif not isinstance(raw_albums, list):
            raw_albums = []
        tracks_raw = data.get("tracks", {})
        if isinstance(tracks_raw, dict):
            tracks_raw = tracks_raw.get("items", [])
        elif not isinstance(tracks_raw, list):
            tracks_raw = []
        return {
            "artist": self._normalize_artist(artist),
            "albums": [self._normalize_album(a) for a in raw_albums],
            "tracks": [self._normalize_track(t) for t in tracks_raw],
        }

    async def get_similar_artists(self, artist_id: int, limit: int = 20) -> list[dict]:
        data = await self._request("/artist/similar/", {"id": artist_id})
        if not data:
            return []
        artists = data.get("artists", data) if isinstance(data, dict) else data
        if isinstance(artists, list):
            return [self._normalize_artist(a) for a in artists[:limit]]
        return []

    async def get_recommendations(self, track_id: int) -> list[dict]:
        data = await self._request("/recommendations/", {"id": track_id})
        if not data:
            return []
        items = data.get("items", data) if isinstance(data, dict) else data
        if isinstance(items, list):
            return [self._normalize_track(item.get("track", item) if "track" in item else item) for item in items]
        return []

    async def get_playlist(self, playlist_id: str, limit: int = 100) -> dict | None:
        data = await self._request("/playlist/", {"id": playlist_id, "limit": min(limit, 100)})
        if not data:
            return None
        playlist = data.get("playlist", data)
        tracks = data.get("tracks", [])
        return {
            "playlist": self._normalize_playlist(playlist),
            "tracks": [self._normalize_track(t) for t in tracks],
        }

    async def get_stream_url(self, track_id: int, quality: str = "FLAC") -> dict | None:
        for base_url in [self._active_endpoint] + [e for e in self.endpoints if e != self._active_endpoint]:
            url = f"{base_url}/track/"
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    resp = await client.get(url, params={"id": track_id, "quality": quality})
                    if resp.status_code == 200:
                        self._active_endpoint = base_url
                        content_type = resp.headers.get("content-type", "")
                        if "json" in content_type:
                            return resp.json()
                        manifest_b64 = resp.text.strip()
                        return self._decode_manifest(manifest_b64)
            except Exception as e:
                logger.warning("tidal_stream_error", url=str(e))
        return None

    async def get_lyrics(self, track_id: int) -> str | None:
        data = await self._request("/info/", {"id": track_id})
        if not data:
            return None
        return data.get("lyrics") or data.get("lyrics_text")

    @staticmethod
    def _decode_manifest(manifest_b64: str) -> dict | None:
        try:
            decoded = base64.b64decode(manifest_b64)
            return json.loads(decoded)
        except Exception:
            return None

    @staticmethod
    def _normalize_track(track: dict) -> dict:
        artist_field = track.get("artist") or {}
        artists_list = track.get("artists", [])
        artist_name = artist_field.get("name", "") or (artists_list[0].get("name", "") if artists_list else "")
        artist_id = artist_field.get("id") or (artists_list[0].get("id") if artists_list else None)
        artist_picture = None
        if artist_field.get("picture"):
            pid = artist_field["picture"]
            artist_picture = f"https://resources.tidal.com/images/{pid.replace('-', '/')}/750x750.jpg"

        album = track.get("album", {})
        cover_id = album.get("cover", "")
        cover_url = None
        if cover_id:
            cover_url = f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/640x640.jpg"

        tags = track.get("mediaMetadata", {}).get("tags", [])
        audio_quality = track.get("audioQuality", "")
        audio_modes = track.get("audioModes", [])

        return {
            "id": track.get("id"),
            "title": track.get("title", ""),
            "duration": track.get("duration", 0),
            "isrc": track.get("isrc"),
            "artist": artist_name,
            "artist_id": artist_id,
            "album": album.get("title", ""),
            "album_id": album.get("id"),
            "cover_url": cover_url,
            "artist_picture": artist_picture,
            "audio_quality": audio_quality,
            "audio_modes": audio_modes,
            "has_dolby_atmos": "DOLBY_ATMOS" in audio_modes,
            "has_hi_res": "HIRES_LOSSLESS" in tags or audio_quality == "HI_RES_LOSSLESS",
            "popularity": track.get("popularity", 0),
            "bpm": track.get("bpm"),
            "key": track.get("key"),
            "replay_gain": track.get("replayGain"),
            "peak": track.get("peak"),
            "explicit": track.get("explicit", False),
            "mix_ids": track.get("mixes", []),
            "url": track.get("url"),
            "copyright": track.get("copyright"),
        }

    @staticmethod
    def _normalize_artist(artist: dict) -> dict:
        picture_url = None
        if artist.get("picture"):
            pid = artist["picture"]
            picture_url = f"https://resources.tidal.com/images/{pid.replace('-', '/')}/750x750.jpg"

        return {
            "id": artist.get("id"),
            "name": artist.get("name", ""),
            "picture_url": picture_url,
            "popularity": artist.get("popularity", 0),
            "url": artist.get("url"),
        }

    @staticmethod
    def _normalize_album(album: dict, artist_name: str = "") -> dict:
        cover_id = album.get("cover", "")
        cover_url = None
        if cover_id:
            cover_url = f"https://resources.tidal.com/images/{cover_id.replace('-', '/')}/640x640.jpg"

        return {
            "id": album.get("id"),
            "title": album.get("title", ""),
            "artist": artist_name,
            "artist_id": None,
            "cover_url": cover_url,
            "release_date": album.get("releaseDate"),
            "duration": album.get("duration", 0),
            "track_count": album.get("numberOfTracks", 0),
            "popularity": album.get("popularity", 0),
            "url": album.get("url"),
            "explicit": album.get("explicit", False),
        }

    @staticmethod
    def _normalize_playlist(playlist: dict) -> dict:
        return {
            "id": playlist.get("uuid") or playlist.get("id"),
            "title": playlist.get("title", ""),
            "description": playlist.get("description"),
            "track_count": playlist.get("numberOfTracks", 0),
            "duration": playlist.get("duration", 0),
            "cover_url": playlist.get("image"),
            "creator": playlist.get("creator", {}).get("name") if isinstance(playlist.get("creator"), dict) else None,
        }


tidal_client = TidalClient()
