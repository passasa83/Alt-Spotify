import os

from httpx import AsyncClient

from app.models.artist import Artist
from app.models.listening_history import ListeningHistory
from app.models.playlist import Playlist
from app.models.track import Track


async def _seed(db_session, tmp_path, test_user):
    artist = Artist(name="Overview Artist")
    db_session.add(artist)
    await db_session.flush()
    present = tmp_path / "present.flac"
    present.write_bytes(b"fLaC")
    tracks = [
        Track(title="present", artist_id=artist.id, duration_seconds=1, file_url=f"local:{present}"),
        Track(title="gone", artist_id=artist.id, duration_seconds=1, file_url=f"local:{tmp_path / 'gone.flac'}"),
        Track(title="silent", artist_id=artist.id, duration_seconds=1),
    ]
    db_session.add_all(tracks)
    await db_session.flush()
    db_session.add(ListeningHistory(user_id=test_user.id, track_id=tracks[0].id))
    db_session.add(Playlist(title="Mine", owner_id=test_user.id))
    await db_session.flush()


async def test_overview_reports_catalogue_and_dirs(
    client: AsyncClient, admin_headers, db_session, test_user, tmp_path, monkeypatch
):
    await _seed(db_session, tmp_path, test_user)
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(tmp_path))
    monkeypatch.setenv("MUSIC_DOWNLOAD_DIR", str(tmp_path / "nowhere"))

    response = await client.get("/api/v1/admin/overview", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()

    catalogue = data["catalogue"]
    assert catalogue["total"] == 3
    assert catalogue["no_audio"] == 1
    assert catalogue["local_files"] == 2
    assert catalogue["missing_files"] == 1
    assert catalogue["playable"] == 1
    assert catalogue["missing_examples"] == [str(tmp_path / "gone.flac")]

    dirs = {d["setting"]: d for d in data["music_dirs"]}
    assert dirs["MUSIC_SCAN_DIR"]["exists"] and dirs["MUSIC_SCAN_DIR"]["audio_files"] == 1
    assert not dirs["MUSIC_DOWNLOAD_DIR"]["exists"]

    codes = {w["code"] for w in data["warnings"]}
    assert {"missing_files", "music_dir_missing"} <= codes
    missing = next(w for w in data["warnings"] if w["code"] == "missing_files")
    assert missing["params"] == {"missing": 1, "total": 2}

    assert data["users"]["total"] >= 2
    assert data["users"]["listeners_7d"] == 1
    assert data["services"]["database"]["ok"] is True
    keys = {c["key"] for c in data["config"]}
    assert "OPEN_REGISTRATION" in keys
    assert not any("SECRET" in k or "PASSWORD" in k for k in keys)


async def test_overview_requires_admin(client: AsyncClient, auth_headers):
    response = await client.get("/api/v1/admin/overview", headers=auth_headers)
    assert response.status_code == 403


async def test_users_list_includes_activity(client: AsyncClient, admin_headers, db_session, test_user, tmp_path):
    await _seed(db_session, tmp_path, test_user)

    response = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert response.status_code == 200
    user = next(u for u in response.json()["items"] if u["email"] == test_user.email)
    assert user["play_count"] == 1
    assert user["playlist_count"] == 1
    assert user["last_played_at"] is not None
    assert user["device_count"] == 0


async def test_overview_groups_checks_by_area(
    client: AsyncClient, admin_headers, db_session, test_user, tmp_path, monkeypatch
):
    await _seed(db_session, tmp_path, test_user)
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(tmp_path))
    monkeypatch.setenv("MUSIC_DOWNLOAD_DIR", str(tmp_path / "nowhere"))

    data = (await client.get("/api/v1/admin/overview", headers=admin_headers)).json()

    areas = {a["area"]: a for a in data["areas"]}
    assert list(areas) == ["playback", "storage", "search", "database", "accounts", "security"]
    assert areas["playback"]["status"] == "error"
    assert areas["playback"]["problems"] == 2  # missing dir + missing file

    by_code = {c["code"]: c for c in data["checks"]}
    # Passing checks are listed too, under their own area.
    assert by_code["music_dir_ok"]["area"] == "playback"
    assert by_code["music_dir_ok"]["params"]["count"] == 1
    assert by_code["database_ok"]["status"] == "ok"
    assert by_code["database_ok"]["area"] == "database"
    assert {c["area"] for c in data["checks"]} == set(areas)
    assert all(w["level"] != "ok" for w in data["warnings"])
