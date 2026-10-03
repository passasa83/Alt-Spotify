"""Search leftovers (tracks without audio) must not clutter what users see."""
from httpx import AsyncClient

from app.models.artist import Artist
from app.models.favorite import Favorite
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track


async def _seed(db_session, test_user):
    artist = Artist(name="Hygiene Artist")
    db_session.add(artist)
    await db_session.flush()
    t = {
        "playable": Track(title="Playable", artist_id=artist.id, duration_seconds=60, genre="rock", file_url="local:/m/p.flac"),
        "orphan": Track(title="Orphan", artist_id=artist.id, duration_seconds=60, genre="rock"),
        "in_playlist": Track(title="InPlaylist", artist_id=artist.id, duration_seconds=60, genre="rock"),
        "favorite": Track(title="Fav", artist_id=artist.id, duration_seconds=60, genre="rock"),
    }
    db_session.add_all(t.values())
    await db_session.flush()
    playlist = Playlist(title="Keep", owner_id=test_user.id)
    db_session.add(playlist)
    await db_session.flush()
    db_session.add(PlaylistTrack(playlist_id=playlist.id, track_id=t["in_playlist"].id, position=1))
    db_session.add(Favorite(user_id=test_user.id, entity_id=t["favorite"].id, entity_type="track"))
    await db_session.flush()
    return t


async def test_track_list_playable_filter(client: AsyncClient, auth_headers, db_session, test_user):
    await _seed(db_session, test_user)

    playable = (await client.get("/api/v1/tracks?playable=true", headers=auth_headers)).json()
    assert [t["title"] for t in playable["items"]] == ["Playable"]
    assert playable["total"] == 1

    empty = (await client.get("/api/v1/tracks?playable=false", headers=auth_headers)).json()
    assert {t["title"] for t in empty["items"]} == {"Orphan", "InPlaylist", "Fav"}


async def test_purge_only_removes_unused_empty_tracks(client: AsyncClient, admin_headers, auth_headers, db_session, test_user):
    await _seed(db_session, test_user)

    preview = await client.post("/api/v1/admin/catalogue/purge-unplayable", headers=admin_headers)
    assert preview.status_code == 200
    assert preview.json() == {"count": 1, "deleted": 0}  # dry run by default

    done = await client.post("/api/v1/admin/catalogue/purge-unplayable?dry_run=false", headers=admin_headers)
    assert done.json() == {"count": 1, "deleted": 1}

    titles = {t["title"] for t in (await client.get("/api/v1/tracks", headers=auth_headers)).json()["items"]}
    assert titles == {"Playable", "InPlaylist", "Fav"}


async def test_purge_requires_admin(client: AsyncClient, auth_headers):
    response = await client.post("/api/v1/admin/catalogue/purge-unplayable", headers=auth_headers)
    assert response.status_code == 403


async def test_overview_reports_purgeable_tracks(client: AsyncClient, admin_headers, db_session, test_user):
    await _seed(db_session, test_user)
    data = (await client.get("/api/v1/admin/overview", headers=admin_headers)).json()
    assert data["catalogue"]["purgeable"] == 1
    clutter = next(c for c in data["checks"] if c["code"] == "catalogue_clutter")
    assert clutter["params"] == {"count": 1} and clutter["area"] == "playback"


async def test_repeated_search_does_not_duplicate_external_tracks(client: AsyncClient, auth_headers, monkeypatch):
    from app.api.v1 import search as search_module

    async def fake_deezer(q, limit=20):
        return [
            {"title": "Same Song", "artist": "Same Artist", "deezer_id": 1, "isrc": "ISRC0001", "duration": 100},
            {"title": "Other Song", "artist": "Other Artist", "deezer_id": 2, "duration": 90},
        ]

    monkeypatch.setattr(search_module, "search_deezer", fake_deezer)
    for _ in range(3):
        response = await client.get("/api/v1/search?q=zzunique&type=tracks", headers=auth_headers)
        assert response.status_code == 200
        assert len(response.json()["tracks"]) == 2

    total = (await client.get("/api/v1/tracks?playable=false", headers=auth_headers)).json()["total"]
    assert total == 2


async def test_smart_playlist_needs_a_rule_and_keeps_playable_tracks(client: AsyncClient, auth_headers, db_session, test_user):
    await _seed(db_session, test_user)

    empty = await client.post("/api/v1/playlists/smart", headers=auth_headers, json={"title": "All", "rules": {}})
    assert empty.status_code == 400

    created = await client.post(
        "/api/v1/playlists/smart",
        headers=auth_headers,
        json={"title": "Rock", "rules": {"genre": {"op": "equals", "value": "rock"}}},
    )
    assert created.status_code == 201
    tracks = (await client.get(f"/api/v1/playlists/{created.json()['id']}/tracks", headers=auth_headers)).json()
    assert len(tracks) == 1


async def test_admin_can_delete_a_track_users_saved(client: AsyncClient, admin_headers, auth_headers, db_session, test_user):
    from app.models.listening_history import ListeningHistory

    t = await _seed(db_session, test_user)
    db_session.add(ListeningHistory(user_id=test_user.id, track_id=t["in_playlist"].id))
    await db_session.flush()

    # Used to fail on the foreign keys (playlist entry, favorite, history).
    for key in ("in_playlist", "favorite"):
        response = await client.delete(f"/api/v1/tracks/{t[key].id}", headers=admin_headers)
        assert response.status_code == 204, key

    titles = {x["title"] for x in (await client.get("/api/v1/tracks", headers=auth_headers)).json()["items"]}
    assert titles == {"Playable", "Orphan"}
    favorites = (await client.get("/api/v1/favorites?entity_type=track", headers=auth_headers)).json()
    assert not (favorites.get("items", favorites) if isinstance(favorites, dict) else favorites)


async def test_purge_include_used_removes_every_track_without_audio(client: AsyncClient, admin_headers, auth_headers, db_session, test_user):
    await _seed(db_session, test_user)

    preview = (await client.post("/api/v1/admin/catalogue/purge-unplayable?include_used=true", headers=admin_headers)).json()
    assert preview == {"count": 3, "deleted": 0}
    done = (await client.post("/api/v1/admin/catalogue/purge-unplayable?include_used=true&dry_run=false", headers=admin_headers)).json()
    assert done["deleted"] == 3

    titles = {x["title"] for x in (await client.get("/api/v1/tracks", headers=auth_headers)).json()["items"]}
    assert titles == {"Playable"}


async def test_purge_also_removes_albums_and_artists_left_empty(client: AsyncClient, admin_headers, auth_headers, db_session, test_user):
    from app.models.album import Album
    from app.models.follow import Follow, FollowType

    await _seed(db_session, test_user)
    # A search leftover: artist + album whose only track has no audio, liked and followed.
    ghost = Artist(name="Ghost Artist")
    db_session.add(ghost)
    await db_session.flush()
    ghost_album = Album(title="Ghost Album", artist_id=ghost.id)
    db_session.add(ghost_album)
    await db_session.flush()
    db_session.add(Track(title="Ghost Song", artist_id=ghost.id, album_id=ghost_album.id, duration_seconds=60))
    db_session.add(Favorite(user_id=test_user.id, entity_id=ghost_album.id, entity_type="album"))
    db_session.add(Follow(follower_id=test_user.id, followed_id=ghost.id, follow_type=FollowType.ARTIST))
    # An album with a playable track must stay, even though its artist has empty tracks too.
    await db_session.flush()

    url = "/api/v1/admin/catalogue/purge-unplayable?include_used=true&include_orphans=true"
    preview = (await client.post(url, headers=admin_headers)).json()
    assert preview == {"count": 4, "deleted": 0, "orphan_albums": 1, "orphan_artists": 1}

    done = (await client.post(url + "&dry_run=false", headers=admin_headers)).json()
    assert done == {"count": 4, "deleted": 4, "orphan_albums": 1, "orphan_artists": 1}

    names = [a["name"] for a in (await client.get("/api/v1/artists", headers=auth_headers)).json()["items"]]
    assert names == ["Hygiene Artist"]  # still has its playable track
    assert (await client.get(f"/api/v1/albums/{ghost_album.id}", headers=auth_headers)).status_code == 404
