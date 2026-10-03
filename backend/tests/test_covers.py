"""Cover art lookups: one cover per album (or per track), not per artist."""
import uuid
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track
from app.services import cover_service


def _itunes(cover: str) -> dict:
    return {"resultCount": 1, "results": [{"artworkUrl100": f"https://img/{cover}/100x100bb.jpg"}]}


async def test_tracks_of_one_artist_get_their_own_cover():
    cover_service._cover_cache.clear()
    answers = {"Band Song A": _itunes("a"), "Band Song B": _itunes("b")}

    async def fake_request(url):
        return next((v for k, v in answers.items() if k.replace(" ", "+") in url), None)

    with patch.object(cover_service, "_throttled_request", side_effect=fake_request):
        a = await cover_service.fetch_cover("Song A", "Band")
        b = await cover_service.fetch_cover("Song B", "Band")
    # Used to return "a" twice: the cache was keyed by artist only.
    assert a == "https://img/a/600x600bb.jpg"
    assert b == "https://img/b/600x600bb.jpg"


async def test_tracks_of_one_album_share_one_lookup():
    cover_service._cover_cache.clear()
    request = AsyncMock(return_value=_itunes("lp"))
    with patch.object(cover_service, "_throttled_request", request):
        first = await cover_service.fetch_cover("Song A", "Band", "The LP")
        second = await cover_service.fetch_cover("Song B", "Band", "The LP")
    assert first == second == "https://img/lp/600x600bb.jpg"
    assert request.await_count == 1
    assert "entity=album" in request.await_args.args[0]


async def _seed(db_session):
    artist = Artist(id=uuid.uuid4(), name="Band")
    db_session.add(artist)
    await db_session.flush()
    album = Album(id=uuid.uuid4(), title="The LP", artist_id=artist.id)
    db_session.add(album)
    await db_session.flush()
    shared = "https://img/wrong/600x600bb.jpg"
    tracks = {
        # Same album, same cover: fine.
        "lp1": Track(title="LP 1", artist_id=artist.id, album_id=album.id, duration_seconds=60, cover_url="https://img/lp.jpg"),
        "lp2": Track(title="LP 2", artist_id=artist.id, album_id=album.id, duration_seconds=60, cover_url="https://img/lp.jpg"),
        # Two singles that inherited the artist's first cover: wrong.
        "s1": Track(title="Single 1", artist_id=artist.id, duration_seconds=60, cover_url=shared),
        "s2": Track(title="Single 2", artist_id=artist.id, duration_seconds=60, cover_url=shared),
        # A single with its own cover: fine.
        "s3": Track(title="Single 3", artist_id=artist.id, duration_seconds=60, cover_url="https://img/s3.jpg"),
    }
    db_session.add_all(tracks.values())
    await db_session.flush()
    return tracks


async def test_recheck_covers_fixes_only_wrongly_shared_covers(client: AsyncClient, db_session, admin_headers):
    tracks = await _seed(db_session)

    preview = (await client.post("/api/v1/recheck-covers", headers=admin_headers)).json()
    assert preview["count"] == 2 and preview["queued"] == 0

    async def fake_fetch(title, artist, album=None):
        return f"https://img/{title.replace(' ', '-').lower()}.jpg"

    with patch("app.services.cover_service.fetch_cover", side_effect=fake_fetch):
        done = await client.post("/api/v1/recheck-covers?dry_run=false", headers=admin_headers)
    assert done.json()["queued"] == 2

    for key in tracks.values():
        await db_session.refresh(key)
    assert tracks["s1"].cover_url == "https://img/single-1.jpg"
    assert tracks["s2"].cover_url == "https://img/single-2.jpg"
    assert tracks["lp1"].cover_url == tracks["lp2"].cover_url == "https://img/lp.jpg"
    assert tracks["s3"].cover_url == "https://img/s3.jpg"
    assert (await client.post("/api/v1/recheck-covers", headers=admin_headers)).json()["count"] == 0


async def test_recheck_covers_requires_admin(client: AsyncClient, auth_headers):
    assert (await client.post("/api/v1/recheck-covers", headers=auth_headers)).status_code == 403


async def test_unreachable_services_are_not_cached_as_no_cover():
    cover_service._cover_cache.clear()
    with patch.object(cover_service, "_throttled_request", AsyncMock(return_value=None)):
        assert await cover_service.fetch_cover("Song", "Band") is None
    # Rate limited / offline: the next lookup must try again.
    with patch.object(cover_service, "_throttled_request", AsyncMock(return_value=_itunes("ok"))):
        assert await cover_service.fetch_cover("Song", "Band") == "https://img/ok/600x600bb.jpg"


async def test_no_result_from_both_services_is_cached():
    cover_service._cover_cache.clear()
    empty = AsyncMock(side_effect=[{"resultCount": 0, "results": []}, {"data": []}])
    with patch.object(cover_service, "_throttled_request", empty):
        assert await cover_service.fetch_cover("Obscure", "Nobody") is None
    request = AsyncMock()
    with patch.object(cover_service, "_throttled_request", request):
        assert await cover_service.fetch_cover("Obscure", "Nobody") is None
    request.assert_not_awaited()
