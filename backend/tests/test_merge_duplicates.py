"""Tracks scanned twice (/music and /app/downloads) where one copy's file is gone."""
import uuid

from httpx import AsyncClient
from sqlalchemy import select

from app.models.artist import Artist
from app.models.favorite import Favorite
from app.models.listening_history import ListeningHistory
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track

URL = "/api/v1/admin/catalogue/merge-missing-duplicates"


def u(value):
    """SQLite hands UUIDs back as hex strings: compare parsed UUIDs."""
    return uuid.UUID(str(value))


async def _seed(db_session, tmp_path, monkeypatch, test_user):
    music = tmp_path / "music"
    (music / "Band discography" / "Album").mkdir(parents=True)
    live_file = music / "Band discography" / "Album" / "01 - Song.flac"
    live_file.write_bytes(b"fLaC")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))
    monkeypatch.setenv("MUSIC_DOWNLOAD_DIR", str(tmp_path / "downloads"))

    artist = Artist(name="Band")
    db_session.add(artist)
    await db_session.flush()
    live = Track(title="Song", artist_id=artist.id, duration_seconds=100, file_url=f"local:{live_file}", play_count=2)
    dead = Track(
        title="Song",
        artist_id=artist.id,
        duration_seconds=100,
        file_url=f"local:{tmp_path / 'downloads' / 'Band discography' / 'Album' / '01 - Song.flac'}",
        play_count=5,
        lyrics_lrc="[00:01.00]la",
    )
    orphan = Track(title="Gone", artist_id=artist.id, duration_seconds=100, file_url=f"local:{tmp_path / 'nowhere.flac'}")
    db_session.add_all([live, dead, orphan])
    await db_session.flush()

    both = Playlist(title="Both copies", owner_id=test_user.id)
    only_dead = Playlist(title="Dead copy only", owner_id=test_user.id)
    db_session.add_all([both, only_dead])
    await db_session.flush()
    db_session.add_all([
        PlaylistTrack(playlist_id=both.id, track_id=live.id, position=1),
        PlaylistTrack(playlist_id=both.id, track_id=dead.id, position=2),
        PlaylistTrack(playlist_id=only_dead.id, track_id=dead.id, position=1),
        Favorite(user_id=test_user.id, entity_id=dead.id, entity_type="track"),
        ListeningHistory(user_id=test_user.id, track_id=dead.id),
    ])
    await db_session.flush()
    return live, dead, both, only_dead


async def test_dry_run_counts_without_changing(client: AsyncClient, admin_headers, db_session, tmp_path, monkeypatch, test_user):
    await _seed(db_session, tmp_path, monkeypatch, test_user)

    data = (await client.post(URL, headers=admin_headers)).json()
    assert data["count"] == 1
    assert data["merged"] == 0
    assert data["unresolved"] == 1  # "Gone" has no live twin
    assert data["examples"][0]["from"].endswith("01 - Song.flac")
    assert "downloads" in data["examples"][0]["from"] and "music" in data["examples"][0]["to"]


async def test_merge_moves_everything_to_the_live_copy(
    client: AsyncClient, admin_headers, auth_headers, db_session, tmp_path, monkeypatch, test_user
):
    live, dead, both, only_dead = await _seed(db_session, tmp_path, monkeypatch, test_user)
    live_id, dead_id, both_id, only_dead_id = live.id, dead.id, both.id, only_dead.id

    data = (await client.post(f"{URL}?dry_run=false", headers=admin_headers)).json()
    assert data["merged"] == 1

    assert (await db_session.execute(select(Track).where(Track.id == dead_id))).scalar_one_or_none() is None
    db_session.expire_all()
    merged = (await db_session.execute(select(Track).where(Track.id == live_id))).scalar_one()
    assert merged.play_count == 7
    assert merged.lyrics_lrc == "[00:01.00]la"

    # Playlist with both copies keeps one row; the other now points to the live copy.
    rows = (await db_session.execute(select(PlaylistTrack))).scalars().all()
    by_playlist = {}
    for r in rows:
        by_playlist.setdefault(u(r.playlist_id), []).append(u(r.track_id))
    assert by_playlist[u(both_id)] == [u(live_id)]
    assert by_playlist[u(only_dead_id)] == [u(live_id)]

    fav = (await db_session.execute(select(Favorite))).scalars().all()
    assert [u(f.entity_id) for f in fav] == [u(live_id)]
    hist = (await db_session.execute(select(ListeningHistory))).scalars().all()
    assert [u(h.track_id) for h in hist] == [u(live_id)]

    # Health no longer reports it.
    overview = (await client.get("/api/v1/admin/overview", headers=admin_headers)).json()
    assert overview["catalogue"]["mergeable"] == 0


async def test_merge_requires_admin(client: AsyncClient, auth_headers):
    assert (await client.post(URL, headers=auth_headers)).status_code == 403
