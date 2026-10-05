"""Music genres: one fixed list, and a lookup for tracks that have none.

Tags, iTunes and Deezer all name genres differently ("Hip-hop/Rap",
"Rap/Hip Hop", "Rap français"...): everything is mapped onto ``GENRES`` so
that browsing a genre finds its tracks. Most files carry no genre tag at all,
so missing genres are looked up per artist (like streaming services do).
"""
import re
import unicodedata
import urllib.parse

import structlog

from app.services.cover_service import _cache_get, _cache_set, _throttled_request

logger = structlog.get_logger("app")

# Canonical genres, stored in tracks.genre (the web app translates them).
GENRES = [
    "Pop", "Hip-Hop", "Rock", "Alternative", "Metal", "Punk", "Electronic", "R&B",
    "French Pop", "Jazz", "Blues", "Classical", "Reggae", "Latin", "Country",
    "Folk", "World", "K-Pop", "Soundtrack",
]

# First match wins: specific genres before the broad ones they contain
# ("hard rock" is rock, "k-pop" is not pop, "metal" before "rock").
_RULES: list[tuple[str, str]] = [
    (r"k ?pop|j ?pop", "K-Pop"),
    (r"hip ?hop|rap|trap|drill|grime", "Hip-Hop"),
    (r"r ?n ?b|r and b|rhythm and blues|soul|funk", "R&B"),
    (r"metal|metalcore|hardcore", "Metal"),
    (r"punk|emo", "Punk"),
    (r"alternative|alternatif|indie|independant", "Alternative"),
    (r"rock|grunge", "Rock"),
    (r"electro|electronique|electronic|dance|house|techno|trance|edm|dubstep|drum|bass|ambient|new age", "Electronic"),
    (r"variete|chanson", "French Pop"),
    (r"jazz|swing|bossa", "Jazz"),
    (r"blues", "Blues"),
    (r"classi|opera|baroque|orchestr", "Classical"),
    (r"reggae|dancehall|ska|dub", "Reggae"),
    (r"latin|reggaeton|salsa|bachata|cumbia|flamenco", "Latin"),
    (r"country|americana", "Country"),
    (r"folk|acoustic", "Folk"),
    (r"afri|world|monde|arab|orient|celt|raï|rai|zouk|kompa", "World"),
    (r"soundtrack|bande originale|film|games|musical|anime|score", "Soundtrack"),
    (r"pop|singer|songwriter", "Pop"),
]
_COMPILED = [(re.compile(rf"\b(?:{pattern})"), genre) for pattern, genre in _RULES]

_CACHE_PREFIX = "genre-artist|"


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9&]+", " ", text).strip()


def canonical_genre(raw: str | None) -> str | None:
    """Map any genre label onto ``GENRES`` (None when unknown or empty)."""
    if not raw or not raw.strip():
        return None
    for genre in GENRES:
        if raw.strip().lower() == genre.lower():
            return genre
    folded = _fold(raw)
    for pattern, genre in _COMPILED:
        if pattern.search(folded):
            return genre
    return None


async def fetch_artist_genre(artist: str, sample_title: str = "") -> str | None:
    """Genre of an artist from iTunes (French store), then Deezer; cached 30 days.

    ``sample_title`` (one of their tracks) disambiguates artists sharing a name.
    """
    if not artist or not artist.strip():
        return None
    cache_key = _CACHE_PREFIX + artist.lower().strip()
    found, cached = await _cache_get(cache_key)
    if found:
        return cached

    query = f"{artist} {sample_title}".strip()
    data = await _throttled_request(
        "https://itunes.apple.com/search?"
        + urllib.parse.urlencode({"term": query, "entity": "song", "limit": 1, "country": "FR"})
    )
    itunes_answered = data is not None
    if data and data.get("resultCount", 0) > 0:
        genre = canonical_genre(data["results"][0].get("primaryGenreName"))
        if genre:
            await _cache_set(cache_key, genre)
            return genre

    deezer_answered = False
    data = await _throttled_request(f"https://api.deezer.com/search/track?q={urllib.parse.quote(query)}&limit=1")
    if data is not None and "error" not in data:
        deezer_answered = True
        if data.get("data"):
            album_id = (data["data"][0].get("album") or {}).get("id")
            album = await _throttled_request(f"https://api.deezer.com/album/{album_id}") if album_id else None
            if album is None or "error" in album:
                deezer_answered = False
            else:
                for item in (album.get("genres") or {}).get("data", []):
                    genre = canonical_genre(item.get("name"))
                    if genre:
                        await _cache_set(cache_key, genre)
                        return genre

    # Remember "unknown" only when both services answered (not on a rate limit).
    if itunes_answered and deezer_answered:
        await _cache_set(cache_key, None)
    return None
