import uuid

import pytest
from httpx import AsyncClient

from app.models.track import Track
from app.models.artist import Artist


async def _create_artist(db_session):
    artist = Artist(id=uuid.uuid4(), name="Lyrics Artist", image_url=None)
    db_session.add(artist)
    await db_session.flush()
    return artist


async def _create_track(db_session, artist_id, lyrics_lrc=None):
    track = Track(
        id=uuid.uuid4(),
        title="Lyrics Track",
        artist_id=artist_id,
        duration_seconds=200,
        is_explicit=False,
        play_count=0,
        lyrics_lrc=lyrics_lrc,
    )
    db_session.add(track)
    await db_session.flush()
    return track


SAMPLE_LRC = "[00:01.00]Line one\n[00:04.50]Line two\n[00:10.200]Line three\n"


async def test_get_lyrics(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, lyrics_lrc=SAMPLE_LRC)
    response = await client.get(f"/api/v1/lyrics/{track.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["track_id"] == str(track.id)
    assert "lyrics_lrc" in data


async def test_get_lyrics_no_lyrics(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, lyrics_lrc=None)
    response = await client.get(f"/api/v1/lyrics/{track.id}")
    assert response.status_code == 404


async def test_get_lyrics_track_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/lyrics/{fake_id}")
    assert response.status_code == 404


async def test_get_parsed_lyrics(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, lyrics_lrc=SAMPLE_LRC)
    response = await client.get(f"/api/v1/lyrics/{track.id}/parsed")
    assert response.status_code == 200
    data = response.json()
    assert data["track_id"] == str(track.id)
    assert "lines" in data
    assert len(data["lines"]) == 3
    assert data["lines"][0]["text"] == "Line one"
    assert data["lines"][1]["text"] == "Line two"
    assert data["lines"][2]["text"] == "Line three"
    assert data["lines"][0]["time_seconds"] == 1.0
    assert data["lines"][1]["time_seconds"] == 4.5


async def test_get_parsed_lyrics_no_lyrics(client: AsyncClient, db_session):
    artist = await _create_artist(db_session)
    track = await _create_track(db_session, artist.id, lyrics_lrc=None)
    response = await client.get(f"/api/v1/lyrics/{track.id}/parsed")
    assert response.status_code == 404


async def test_get_parsed_lyrics_track_not_found(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/lyrics/{fake_id}/parsed")
    assert response.status_code == 404


def test_parse_lrc_basic():
    from app.api.v1.lyrics import parse_lrc

    lrc = "[00:05.00]Hello\n[00:10.50]World\n"
    result = parse_lrc(lrc)
    assert len(result) == 2
    assert result[0]["time_seconds"] == 5.0
    assert result[0]["text"] == "Hello"
    assert result[1]["time_seconds"] == 10.5
    assert result[1]["text"] == "World"


def test_parse_lrc_empty():
    from app.api.v1.lyrics import parse_lrc

    result = parse_lrc("")
    assert result == []


def test_parse_lrc_skip_empty_lines():
    from app.api.v1.lyrics import parse_lrc

    lrc = "[00:05.00]\n[00:10.00]Something\n"
    result = parse_lrc(lrc)
    assert len(result) == 1
    assert result[0]["text"] == "Something"


def test_parse_lrc_milliseconds_2_digits():
    from app.api.v1.lyrics import parse_lrc

    lrc = "[01:30.50]Test\n"
    result = parse_lrc(lrc)
    assert result[0]["time_seconds"] == 90.5
