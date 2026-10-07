"""Tracks whose audio file vanished from disk: fetch them again, or drop them."""
import uuid
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select

from app.models.artist import Artist
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track


async def _seed(db_session, test_user, tmp_path):
    present_file = tmp_path / "present.mp3"
    present_file.write_bytes(b"audio")
    artist = Artist(id=uuid.uuid4(), name="Lost Band")
    tracks = {
        # File gone.
        "gone": Track(
            title="Gone", artist_id=artist.id, duration_seconds=60, genre="rock", file_url="local:/music/gone.mp3"
        ),
        # File gone, but saved in a playlist.
        "saved": Track(
            title="Saved", artist_id=artist.id, duration_seconds=60, genre="rock", file_url="local:/music/saved.mp3"
        ),
        # File gone, HLS copy still plays it.
        "streamed": Track(
            title="Streamed",
            artist_id=artist.id,
            duration_seconds=60,
            genre="rock",
            file_url="local:/music/streamed.mp3",
            hls_path="hls/streamed/master.m3u8",
        ),
        # File really on disk.
        "present": Track(
            title="Present",
            artist_id=artist.id,
            duration_seconds=60,
            genre="rock",
            file_url=f"local:{present_file}",
        ),
    }
    db_session.add(artist)
    db_session.add_all(tracks.values())
    await db_session.flush()
    playlist = Playlist(title="Keep", owner_id=test_user.id)
    db_session.add(playlist)
    await db_session.flush()
    db_session.add(PlaylistTrack(playlist_id=playlist.id, track_id=tracks["saved"].id, position=1))
    # The background jobs open their own transactions: the seed must be
    # committed, or their rollback would wipe it from this session.
    await db_session.commit()
    return tracks


async def test_purge_missing_keeps_used_tracks_and_the_ones_with_hls(
    client: AsyncClient, admin_headers, auth_headers, db_session, test_user, tmp_path
):
    await _seed(db_session, test_user, tmp_path)

    preview = (await client.post("/api/v1/admin/catalogue/purge-missing", headers=admin_headers)).json()
    assert preview == {"count": 1, "deleted": 0}  # dry run, only "Gone"

    with_used = (
        await client.post("/api/v1/admin/catalogue/purge-missing?include_used=true", headers=admin_headers)
    ).json()
    # "Saved" joins in; "Streamed" is excluded by the very query, it still plays.
    assert with_used["count"] == 2

    url = "/api/v1/admin/catalogue/purge-missing?include_used=true&include_orphans=true&dry_run=false"
    done = (await client.post(url, headers=admin_headers)).json()
    assert done == {"count": 2, "deleted": 2, "orphan_albums": 0, "orphan_artists": 0}

    titles = {t["title"] for t in (await client.get("/api/v1/tracks", headers=auth_headers)).json()["items"]}
    assert titles == {"Streamed", "Present"}
    entries = (await db_session.execute(select(PlaylistTrack.track_id))).scalars().all()
    assert entries == []  # the playlist entry went with its track
    # Nothing missing and unplayable left for the button to report.
    assert (await client.post("/api/v1/admin/catalogue/purge-missing", headers=admin_headers)).json()["count"] == 0


async def test_redownload_missing_fetches_the_files_again(
    client: AsyncClient, admin_headers, db_session, test_user, tmp_path
):
    tracks = await _seed(db_session, test_user, tmp_path)
    # The re-downloaded file must really be on disk, or the count never clears.
    refound = tmp_path / "refound.mp3"
    refound.write_bytes(b"new")

    preview = (await client.post("/api/v1/admin/catalogue/redownload-missing", headers=admin_headers)).json()
    assert preview == {"count": 3, "queued": 0, "running": False}  # "present" has its file

    download = AsyncMock(
        return_value={
            "success": True,
            "file_url": f"local:{refound}",
            "youtube_duration": 60,
            "metadata": {"album": "B-Sides"},
        }
    )
    with patch("app.services.yt_dlp_download.search_and_download", download), patch(
        "app.services.cover_service.fetch_cover", AsyncMock(return_value=None)
    ), patch("app.services.album_lookup.fetch_track_album", AsyncMock(return_value=None)):
        done = await client.post("/api/v1/admin/catalogue/redownload-missing?dry_run=false", headers=admin_headers)
    assert done.json() == {"count": 3, "queued": 3, "running": True}
    assert download.await_count == 3

    for track in tracks.values():
        await db_session.refresh(track)
    assert tracks["gone"].file_url == f"local:{refound}"
    assert tracks["streamed"].file_url == f"local:{refound}"
    assert tracks["present"].file_url.endswith("present.mp3")  # untouched
    assert (await client.post("/api/v1/admin/catalogue/redownload-missing", headers=admin_headers)).json()["count"] == 0


async def test_redownload_missing_leaves_the_tracks_it_cannot_find(
    client: AsyncClient, admin_headers, db_session, test_user, tmp_path
):
    tracks = await _seed(db_session, test_user, tmp_path)
    not_found = AsyncMock(return_value={"success": False, "error": "No results found on YouTube"})

    with patch("app.services.yt_dlp_download.search_and_download", not_found):
        await client.post("/api/v1/admin/catalogue/redownload-missing?dry_run=false", headers=admin_headers)

    await db_session.refresh(tracks["gone"])
    assert tracks["gone"].file_url == "local:/music/gone.mp3"  # untouched, still retryable
    assert (await client.post("/api/v1/admin/catalogue/redownload-missing", headers=admin_headers)).json()["count"] == 3


async def test_missing_file_repair_requires_admin(client: AsyncClient, auth_headers):
    assert (await client.post("/api/v1/admin/catalogue/purge-missing", headers=auth_headers)).status_code == 403
    assert (await client.post("/api/v1/admin/catalogue/redownload-missing", headers=auth_headers)).status_code == 403
