"""/local/covers/{path} must only serve images from the music folders."""
from httpx import AsyncClient


async def test_cover_inside_music_folder_is_served(client: AsyncClient, auth_headers, tmp_path, monkeypatch):
    music = tmp_path / "music"
    (music / "Artist" / "Album").mkdir(parents=True)
    (music / "Artist" / "Album" / "cover.jpg").write_bytes(b"\xff\xd8\xff\xe0jpeg")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))

    path = str(music / "Artist" / "Album" / "cover.jpg").lstrip("/")
    response = await client.get(f"/api/v1/local/covers/{path}", headers=auth_headers)
    assert response.status_code == 200
    assert response.content.startswith(b"\xff\xd8")


async def test_files_outside_music_folders_are_refused(client: AsyncClient, auth_headers, tmp_path, monkeypatch):
    music = tmp_path / "music"
    music.mkdir()
    secret = tmp_path / "secret.jpg"  # an image, but outside the music folders
    secret.write_bytes(b"\xff\xd8 not yours")
    env_file = tmp_path / ".env"
    env_file.write_text("SECRET_KEY=leak")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))

    for target in (secret, env_file, music / ".." / "secret.jpg"):
        response = await client.get(f"/api/v1/local/covers/{str(target).lstrip('/')}", headers=auth_headers)
        assert response.status_code == 404, target


async def test_non_image_inside_music_folder_is_refused(client: AsyncClient, auth_headers, tmp_path, monkeypatch):
    music = tmp_path / "music"
    music.mkdir()
    (music / "notes.txt").write_text("private")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))

    response = await client.get(f"/api/v1/local/covers/{str(music / 'notes.txt').lstrip('/')}", headers=auth_headers)
    assert response.status_code == 404


async def _local_track(db_session, file_url):
    from app.models.artist import Artist
    from app.models.track import Track

    artist = Artist(name="Local")
    db_session.add(artist)
    await db_session.flush()
    track = Track(title="L", artist_id=artist.id, duration_seconds=1, file_url=file_url)
    db_session.add(track)
    await db_session.flush()
    return track


async def test_stream_serves_files_inside_music_folder(client: AsyncClient, auth_headers, db_session, tmp_path, monkeypatch):
    music = tmp_path / "music"
    music.mkdir()
    song = music / "song.flac"
    song.write_bytes(b"fLaC" + b"\x00" * 100)
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))
    track = await _local_track(db_session, f"local:{song}")

    response = await client.get(f"/api/v1/tracks/{track.id}/stream", headers={**auth_headers, "Range": "bytes=0-3"})
    assert response.status_code == 206
    assert response.content == b"fLaC"


async def test_stream_refuses_files_outside_music_folders(client: AsyncClient, auth_headers, db_session, tmp_path, monkeypatch):
    music = tmp_path / "music"
    music.mkdir()
    outside = tmp_path / "server.env"
    outside.write_text("SECRET_KEY=leak")
    monkeypatch.setenv("MUSIC_SCAN_DIR", str(music))
    # file_url can be set by an admin through the API.
    track = await _local_track(db_session, f"local:{outside}")

    response = await client.get(f"/api/v1/tracks/{track.id}/stream", headers=auth_headers)
    assert response.status_code == 404
    assert b"leak" not in response.content
