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
ALL_URL = "/api/v1/admin/catalogue/merge-duplicates"


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
    assert (await client.post(ALL_URL, headers=auth_headers)).status_code == 403


async def _seed_two_live_copies(db_session, tmp_path, monkeypatch, test_user):
    """The same song twice with both files still on disk (two music folders)."""
    music = tmp_path / "music"
    downloads = tmp_path / "downloads"
    (music / "Album").mkdir(parents=True)
    (downloads / "Album").mkdir(parents=True)
    keep_file = music / "Album" / "01 - Song.flac"
    keep_file.write_bytes(b"fLaC")
    other_file = downloads / "Album" / "01 - Song.flac"
    other_file.write_bytes(b"fLaC")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))
    monkeypatch.setenv("MUSIC_DOWNLOAD_DIR", str(downloads))

    artist = Artist(name="Band")
    db_session.add(artist)
    await db_session.flush()
    keep = Track(title="Song", artist_id=artist.id, duration_seconds=100, file_url=f"local:{keep_file}", play_count=9)
    extra = Track(title="Song", artist_id=artist.id, duration_seconds=100, file_url=f"local:{other_file}", play_count=1)
    db_session.add_all([keep, extra])
    await db_session.flush()

    playlist = Playlist(title="Uses the copy", owner_id=test_user.id)
    db_session.add(playlist)
    await db_session.flush()
    db_session.add_all([
        PlaylistTrack(playlist_id=playlist.id, track_id=extra.id, position=1),
        Favorite(user_id=test_user.id, entity_id=extra.id, entity_type="track"),
        ListeningHistory(user_id=test_user.id, track_id=extra.id),
    ])
    await db_session.flush()
    return keep, extra, playlist


async def test_same_song_twice_is_only_caught_by_the_full_merge(
    client: AsyncClient, admin_headers, db_session, tmp_path, monkeypatch, test_user
):
    keep, extra, _playlist = await _seed_two_live_copies(db_session, tmp_path, monkeypatch, test_user)

    # The missing-file endpoint ignores pairs where both files exist.
    assert (await client.post(URL, headers=admin_headers)).json()["count"] == 0

    data = (await client.post(ALL_URL, headers=admin_headers)).json()
    assert data["count"] == 1
    assert data["merged"] == 0
    assert data["unresolved"] == 0
    assert data["examples"][0]["from"].endswith("01 - Song.flac")


async def test_full_merge_keeps_the_most_played_copy_and_moves_references(
    client: AsyncClient, admin_headers, db_session, tmp_path, monkeypatch, test_user
):
    keep, extra, playlist = await _seed_two_live_copies(db_session, tmp_path, monkeypatch, test_user)
    keep_id, extra_id, playlist_id = keep.id, extra.id, playlist.id

    data = (await client.post(f"{ALL_URL}?dry_run=false", headers=admin_headers)).json()
    assert data["merged"] == 1

    assert (await db_session.execute(select(Track).where(Track.id == extra_id))).scalar_one_or_none() is None
    db_session.expire_all()
    merged = (await db_session.execute(select(Track).where(Track.id == keep_id))).scalar_one()
    assert merged.play_count == 10
    # The surviving copy keeps its own file: nothing is deleted on disk.
    assert merged.file_url == f"local:{tmp_path / 'music' / 'Album' / '01 - Song.flac'}"
    assert (tmp_path / "downloads" / "Album" / "01 - Song.flac").exists()

    rows = (await db_session.execute(select(PlaylistTrack))).scalars().all()
    assert [(u(r.playlist_id), u(r.track_id)) for r in rows] == [(u(playlist_id), u(keep_id))]

    fav = (await db_session.execute(select(Favorite))).scalars().all()
    assert [u(f.entity_id) for f in fav] == [u(keep_id)]
    hist = (await db_session.execute(select(ListeningHistory))).scalars().all()
    assert [u(h.track_id) for h in hist] == [u(keep_id)]

    # Nothing left to merge, and the health check never saw a missing file.
    assert (await client.post(ALL_URL, headers=admin_headers)).json()["count"] == 0
    overview = (await client.get("/api/v1/admin/overview", headers=admin_headers)).json()
    assert overview["catalogue"]["mergeable"] == 0


def test_normalize_title_drops_upload_noise_but_keeps_versions():
    from app.services.admin_overview import normalize_title

    assert normalize_title("Linkin Park - Numb (Official Video)", "Linkin Park") == "numb"
    assert normalize_title("Caméléon [Clip officiel]", "GIMS") == "cameleon"
    assert normalize_title("My Immortal (Remastered 2023)", "Evanescence") == "my immortal"
    # A live recording is another version, even when remastered.
    assert normalize_title("My Immortal (Live At O2 Arena / 2022 / Remastered 2023)", "Evanescence") != "my immortal"
    assert normalize_title("Bleed (Remix)", "Connor Kauffman") == "bleed remix"
    assert normalize_title("Est-ce que tu m'aimes ?", "GIMS") == normalize_title("Est-ce que tu m’aimes", "GIMS")


async def _band_tracks(db_session, tmp_path, monkeypatch, specs):
    """specs: (title, duration, relative path) -> tracks with real files."""
    music = tmp_path / "music"
    downloads = tmp_path / "downloads"
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))
    monkeypatch.setenv("MUSIC_DOWNLOAD_DIR", str(downloads))
    artist = Artist(name="Connor Kauffman")
    db_session.add(artist)
    await db_session.flush()
    tracks = []
    for title, duration, rel in specs:
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"audio")
        tracks.append(Track(title=title, artist_id=artist.id, duration_seconds=duration, file_url=f"local:{path}"))
    db_session.add_all(tracks)
    await db_session.flush()
    return tracks


async def test_full_merge_catches_the_duplicates_seen_on_production(
    client: AsyncClient, admin_headers, db_session, tmp_path, monkeypatch
):
    tracks = await _band_tracks(db_session, tmp_path, monkeypatch, [
        # Same song on an album and as a single: different file names.
        ("Bleed", 145, "music/Connor Kauffman discography/Never Worth Saving/02 - Connor Kauffman - Bleed.flac"),
        ("Bleed", 145, "music/Connor Kauffman discography/Bleed/01 - Connor Kauffman - Bleed.flac"),
        # Downloaded again from YouTube: a few seconds longer, noisy title.
        ("Cradles", 209, "music/data/Cradles.flac"),
        ("Connor Kauffman - Cradles (Official Video)", 218, "downloads/Cradles.mp3"),
        # Other recordings of one title: kept apart.
        ("Hostage", 145, "music/a/Hostage.flac"),
        ("Hostage (Live)", 146, "music/b/Hostage (Live).flac"),
        ("Remember", 130, "music/c/Remember.flac"),
        ("Remember", 160, "music/d/Remember.flac"),
        # Generic titles from two albums: not the same song.
        ("Intro", 84, "music/e/Intro.flac"),
        ("Intro", 90, "music/f/Intro.flac"),
    ])
    preview = (await client.post(ALL_URL, headers=admin_headers)).json()
    assert preview["count"] == 2

    cradles_flac, cradles_youtube = tracks[2], tracks[3]
    keep_id, drop_id = cradles_flac.id, cradles_youtube.id
    data = (await client.post(f"{ALL_URL}?dry_run=false", headers=admin_headers)).json()
    assert data["merged"] == 2

    db_session.expire_all()
    left = (await db_session.execute(select(Track))).scalars().all()
    assert sorted(t.title for t in left) == sorted(
        ["Bleed", "Cradles", "Hostage", "Hostage (Live)", "Remember", "Remember", "Intro", "Intro"]
    )
    ids = {u(t.id) for t in left}
    # The lossless copy from the music folder wins over the YouTube download.
    assert u(keep_id) in ids and u(drop_id) not in ids
