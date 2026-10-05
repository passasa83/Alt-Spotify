"""Genres: one list for tags, iTunes and Deezer, filled per artist."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.models.artist import Artist
from app.models.track import Track
from app.services import cover_service, genre_service
from app.services.genre_service import canonical_genre


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Hip-hop/Rap", "Hip-Hop"),  # iTunes
        ("Rap/Hip Hop", "Hip-Hop"),  # Deezer
        ("Rap français", "Hip-Hop"),
        ("Hard rock", "Rock"),
        ("Heavy Metal", "Metal"),
        ("Alternative", "Alternative"),
        ("Électronique", "Electronic"),
        ("Dance", "Electronic"),
        ("Variété française", "French Pop"),
        ("Musique africaine", "World"),
        ("K-Pop", "K-Pop"),
        ("Pop", "Pop"),
        ("R&B/Soul", "R&B"),
        ("Films/Games", "Soundtrack"),
        ("", None),
        ("Something else", None),
    ],
)
def test_canonical_genre(raw, expected):
    assert canonical_genre(raw) == expected


async def test_artist_genre_from_itunes_then_cached():
    cover_service._cover_cache.clear()
    itunes = {"resultCount": 1, "results": [{"primaryGenreName": "Hip-hop/Rap"}]}
    request = AsyncMock(return_value=itunes)
    with patch.object(genre_service, "_throttled_request", request):
        assert await genre_service.fetch_artist_genre("GIMS", "Caméléon") == "Hip-Hop"
        assert await genre_service.fetch_artist_genre("GIMS", "Bella") == "Hip-Hop"
    assert request.await_count == 1
    assert "country=FR" in request.await_args.args[0]


async def test_artist_genre_falls_back_to_deezer_album():
    cover_service._cover_cache.clear()
    answers = [
        {"resultCount": 0, "results": []},
        {"data": [{"album": {"id": 42}}]},
        {"genres": {"data": [{"name": "Electro"}]}},
    ]
    with patch.object(genre_service, "_throttled_request", AsyncMock(side_effect=answers)):
        assert await genre_service.fetch_artist_genre("Marcel Dettmann", "Range") == "Electronic"


async def _seed(db_session):
    gims = Artist(id=uuid.uuid4(), name="GIMS")
    band = Artist(id=uuid.uuid4(), name="Band")
    db_session.add_all([gims, band])
    await db_session.flush()
    db_session.add_all([
        Track(title="Caméléon", artist_id=gims.id, duration_seconds=200, file_url="audio/a.mp3"),
        Track(title="Bella", artist_id=gims.id, duration_seconds=200, file_url="audio/b.mp3"),
        # A tag in another spelling: mapped, and it gives the artist's genre.
        Track(title="Song", artist_id=band.id, duration_seconds=200, file_url="audio/c.mp3", genre="Hard rock"),
        Track(title="Other", artist_id=band.id, duration_seconds=200, file_url="audio/d.mp3"),
    ])
    await db_session.flush()


async def test_fill_genres_per_artist(client: AsyncClient, db_session, admin_headers, auth_headers):
    await _seed(db_session)

    preview = (await client.post("/api/v1/fill-genres", headers=admin_headers)).json()
    assert preview["tracks"] == 3 and preview["artists"] == 2

    lookup = AsyncMock(return_value="Hip-Hop")
    with patch("app.services.genre_fill.fetch_artist_genre", lookup):
        assert (await client.post("/api/v1/fill-genres?dry_run=false", headers=admin_headers)).status_code == 200
    # Only GIMS needed a lookup: Band already had a (tagged) genre.
    assert lookup.await_count == 1

    genres = (await client.get("/api/v1/tracks/genres", headers=auth_headers)).json()
    assert genres == [{"genre": "Hip-Hop", "count": 2}, {"genre": "Rock", "count": 2}]
    hip_hop = (await client.get("/api/v1/tracks?genre=Hip-Hop", headers=auth_headers)).json()
    assert sorted(t["title"] for t in hip_hop["items"]) == ["Bella", "Caméléon"]
    assert (await client.post("/api/v1/fill-genres", headers=admin_headers)).json()["tracks"] == 0


async def test_fill_genres_requires_admin(client: AsyncClient, auth_headers):
    assert (await client.post("/api/v1/fill-genres", headers=auth_headers)).status_code == 403
