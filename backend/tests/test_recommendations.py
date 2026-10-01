import uuid

import pytest
from httpx import AsyncClient

from app.services.recommendation import (
    get_similar_tracks,
    get_radio_tracks,
    get_personalized_recommendations,
)
from app.models.track import Track
from sqlalchemy import select


async def _seed_tracks(client, admin_headers, db_session, count=3):
    artist_resp = await client.post(
        "/api/v1/artists",
        headers=admin_headers,
        json={"name": "Recommend Artist"},
    )
    artist_id = artist_resp.json()["id"]

    track_ids = []
    for i in range(count):
        resp = await client.post(
            "/api/v1/tracks",
            headers=admin_headers,
            json={
                "title": f"Seed Track {i}",
                "artist_id": str(artist_id),
                "duration_seconds": 180 + i * 30,
                "genre": "rock",
            },
        )
        track_ids.append(resp.json()["id"])

    return artist_id, track_ids


async def test_get_similar_tracks(client: AsyncClient, admin_headers, db_session):
    artist_id, track_ids = await _seed_tracks(client, admin_headers, db_session)

    result = await get_similar_tracks(uuid.UUID(track_ids[0]), db_session)
    assert isinstance(result, list)


async def test_get_similar_tracks_nonexistent(client: AsyncClient, db_session):
    result = await get_similar_tracks(uuid.uuid4(), db_session)
    assert result == []


async def test_radio_tracks(client: AsyncClient, admin_headers, db_session):
    artist_id, track_ids = await _seed_tracks(client, admin_headers, db_session)

    result = await get_radio_tracks(uuid.UUID(track_ids[0]), db_session)
    assert isinstance(result, list)


async def test_radio_tracks_nonexistent(client: AsyncClient, db_session):
    result = await get_radio_tracks(uuid.uuid4(), db_session)
    assert result == []


async def test_personalized_recommendations(
    client: AsyncClient, auth_headers, admin_headers, db_session, test_user
):
    await _seed_tracks(client, admin_headers, db_session)

    results = await get_personalized_recommendations(test_user.id, db_session)
    assert isinstance(results, list)


async def test_personalized_recommendations_empty(
    client: AsyncClient, db_session, test_user
):
    results = await get_personalized_recommendations(test_user.id, db_session)
    assert isinstance(results, list)


async def _seed_playable(db_session):
    from app.models.artist import Artist

    artist = Artist(name="Autoplay Artist")
    other_artist = Artist(name="Other Artist")
    db_session.add_all([artist, other_artist])
    await db_session.flush()

    def make(title, artist_id, genre="rock", **kwargs):
        kwargs.setdefault("file_url", f"tracks/{title}.mp3")
        return Track(title=title, artist_id=artist_id, duration_seconds=180, genre=genre, **kwargs)

    tracks = {
        "seed": make("seed", artist.id),
        "same_artist": make("same_artist", artist.id, genre="jazz"),
        "same_genre": make("same_genre", other_artist.id),
        "no_audio": make("no_audio", artist.id, file_url=None),
        "explicit": make("explicit", artist.id, is_explicit=True),
        "unrelated": make("unrelated", other_artist.id, genre="classical"),
    }
    db_session.add_all(tracks.values())
    await db_session.flush()
    return tracks


async def test_autoplay_returns_playable_related_tracks(client: AsyncClient, auth_headers, db_session):
    tracks = await _seed_playable(db_session)

    response = await client.get(
        f"/api/v1/recommendations/autoplay/{tracks['seed'].id}",
        params={"limit": 3},
        headers=auth_headers,
    )
    assert response.status_code == 200
    items = response.json()["tracks"]
    titles = {t["title"] for t in items}
    assert "seed" not in titles
    assert "no_audio" not in titles
    # Related tracks come before the popular top-up.
    assert {"same_artist", "same_genre", "explicit"} == titles
    assert all(t["file_url"] for t in items)
    assert items[0]["artist"]["name"]


async def test_autoplay_tops_up_and_honours_exclude(client: AsyncClient, auth_headers, db_session):
    tracks = await _seed_playable(db_session)

    response = await client.get(
        f"/api/v1/recommendations/autoplay/{tracks['seed'].id}",
        params={"limit": 10, "exclude": f"{tracks['same_artist'].id},not-a-uuid"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    titles = {t["title"] for t in response.json()["tracks"]}
    assert titles == {"same_genre", "explicit", "unrelated"}


async def test_autoplay_hides_explicit_for_child_accounts(client: AsyncClient, auth_headers, db_session, test_user):
    tracks = await _seed_playable(db_session)
    test_user.is_child_account = True
    await db_session.flush()

    response = await client.get(
        f"/api/v1/recommendations/autoplay/{tracks['seed'].id}",
        headers=auth_headers,
    )
    titles = {t["title"] for t in response.json()["tracks"]}
    assert "explicit" not in titles
