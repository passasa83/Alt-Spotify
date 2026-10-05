"""Instance health for the admin overview: users, catalogue availability,
music folders, backing services, configuration and the warnings they raise."""

import asyncio
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.admin_invite import AdminInviteToken
from app.models.listening_history import ListeningHistory
from app.models.track import Track
from app.models.user import User, UserRole

LOCAL_PREFIX = "local:"
# Stop counting files past this: the number is only an indicator.
_FILE_COUNT_CAP = 100_000
_AUDIO_EXTENSIONS = (".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus")
_DEFAULT_CREDENTIALS = {"minioadmin", "changeme"}
_SERVICE_TIMEOUT = 3  # seconds per backing-service check


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def music_dirs() -> list[tuple[str, str]]:
    """(setting name, path inside the container) of the mounted music folders."""
    return [
        ("MUSIC_SCAN_DIR", os.environ.get("MUSIC_SCAN_DIR", "/music")),
        ("MUSIC_DOWNLOAD_DIR", os.environ.get("MUSIC_DOWNLOAD_DIR", "/app/downloads")),
    ]


def _inspect_dir(path: str) -> dict:
    info = {"path": path, "exists": os.path.isdir(path), "writable": False, "audio_files": 0, "capped": False}
    if not info["exists"]:
        return info
    info["writable"] = os.access(path, os.W_OK)
    count = 0
    for _root, _dirs, files in os.walk(path):
        count += sum(1 for f in files if f.lower().endswith(_AUDIO_EXTENSIONS))
        if count >= _FILE_COUNT_CAP:
            info["capped"] = True
            break
    info["audio_files"] = count
    return info


def _count_missing(paths: list[str]) -> tuple[int, list[str]]:
    missing = [p for p in paths if not os.path.isfile(p)]
    return len(missing), missing[:5]


async def _users_summary(db: AsyncSession) -> dict:
    week_ago = _utcnow() - timedelta(days=7)
    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active = (await db.execute(select(func.count(User.id)).where(User.is_active.is_(True)))).scalar() or 0
    admins = (await db.execute(select(func.count(User.id)).where(User.role == UserRole.ADMIN))).scalar() or 0
    new_7d = (await db.execute(select(func.count(User.id)).where(User.created_at >= week_ago))).scalar() or 0
    listeners_7d = (
        await db.execute(
            select(func.count(func.distinct(ListeningHistory.user_id))).where(ListeningHistory.played_at >= week_ago)
        )
    ).scalar() or 0
    pending_invites = (
        await db.execute(
            select(func.count(AdminInviteToken.id)).where(
                AdminInviteToken.is_revoked.is_(False),
                AdminInviteToken.use_count < AdminInviteToken.max_uses,
                (AdminInviteToken.expires_at.is_(None)) | (AdminInviteToken.expires_at > datetime.now(timezone.utc)),
            )
        )
    ).scalar() or 0
    return {
        "total": total,
        "active": active,
        "admins": admins,
        "new_7d": new_7d,
        "listeners_7d": listeners_7d,
        "pending_invites": pending_invites,
    }


async def _catalogue_summary(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count(Track.id)))).scalar() or 0
    no_audio = (
        await db.execute(select(func.count(Track.id)).where(Track.file_url.is_(None), Track.hls_path.is_(None)))
    ).scalar() or 0
    hls = (await db.execute(select(func.count(Track.id)).where(Track.hls_path.isnot(None)))).scalar() or 0
    stored = (
        await db.execute(
            select(func.count(Track.id)).where(Track.file_url.isnot(None), ~Track.file_url.startswith(LOCAL_PREFIX))
        )
    ).scalar() or 0
    local_urls = (
        await db.execute(select(Track.file_url).where(Track.file_url.startswith(LOCAL_PREFIX)))
    ).scalars().all()
    local_paths = [url[len(LOCAL_PREFIX):] for url in local_urls]
    missing, missing_examples = await asyncio.to_thread(_count_missing, local_paths)
    return {
        "total": total,
        "no_audio": no_audio,
        "local_files": len(local_paths),
        "object_storage": stored,
        "hls": hls,
        "missing_files": missing,
        "missing_examples": missing_examples,
        "playable": total - no_audio - missing,
    }


async def _services_status(db: AsyncSession) -> dict:
    services: dict[str, dict] = {}

    try:
        await db.execute(text("SELECT 1"))
        services["database"] = {"ok": True}
    except Exception as e:  # noqa: BLE001 - reported to the admin as is
        services["database"] = {"ok": False, "detail": (str(e) or type(e).__name__)[:200]}

    try:
        from app.core.redis import get_redis

        await asyncio.wait_for((await get_redis()).ping(), timeout=_SERVICE_TIMEOUT)
        services["redis"] = {"ok": True}
    except Exception as e:  # noqa: BLE001
        services["redis"] = {"ok": False, "detail": (str(e) or type(e).__name__)[:200]}

    try:
        from app.core.minio import get_minio_client

        # Blocking calls (creating the client already hits the server) that
        # retry for a long time when MinIO is down: off the event loop, bounded.
        exists = await asyncio.wait_for(
            asyncio.to_thread(lambda: get_minio_client().bucket_exists(settings.MINIO_BUCKET)),
            timeout=_SERVICE_TIMEOUT,
        )
        services["minio"] = {"ok": bool(exists), "detail": None if exists else f"bucket {settings.MINIO_BUCKET} missing"}
    except Exception as e:  # noqa: BLE001
        services["minio"] = {"ok": False, "detail": (str(e) or type(e).__name__)[:200]}

    try:
        async with httpx.AsyncClient(timeout=_SERVICE_TIMEOUT) as client:
            response = await client.get(f"{settings.MEILISEARCH_URL}/health")
        services["meilisearch"] = {"ok": response.status_code == 200}
    except Exception as e:  # noqa: BLE001
        services["meilisearch"] = {"ok": False, "detail": (str(e) or type(e).__name__)[:200]}

    return services


def _config() -> list[dict]:
    """Settings worth checking at a glance. Never secrets, only whether they are set."""
    return [
        {"key": "BASE_URL", "value": settings.BASE_URL},
        {"key": "OPEN_REGISTRATION", "value": settings.OPEN_REGISTRATION},
        {"key": "CORS_ORIGINS", "value": settings.CORS_ORIGINS},
        {"key": "ACCESS_TOKEN_EXPIRE_MINUTES", "value": settings.ACCESS_TOKEN_EXPIRE_MINUTES},
        {"key": "REFRESH_TOKEN_EXPIRE_DAYS", "value": settings.REFRESH_TOKEN_EXPIRE_DAYS},
        *({"key": name, "value": path} for name, path in music_dirs()),
        {"key": "MINIO_BUCKET", "value": settings.MINIO_BUCKET},
        {"key": "RATE_LIMIT_ENABLED", "value": settings.RATE_LIMIT_ENABLED},
        {"key": "DEBUG", "value": settings.DEBUG},
        {"key": "LOG_LEVEL", "value": settings.LOG_LEVEL},
        {"key": "SPOTIFY_CLIENT_ID", "value": "set" if settings.SPOTIFY_CLIENT_ID else "not set"},
        {"key": "LASTFM_API_KEY", "value": "set" if settings.LASTFM_API_KEY else "not set"},
    ]


# Areas shown as separate panels in the admin view, in display order.
AREAS = ("playback", "storage", "search", "database", "accounts", "security")
_STATUS_RANK = {"ok": 0, "info": 1, "warning": 2, "error": 3}


def _checks(catalogue: dict, dirs: list[dict], services: dict, users: dict) -> list[dict]:
    """Every check, passing ones included, so each area shows what works too.

    ``code`` names the outcome (``minio_ok`` / ``minio_down``), the frontend
    turns code + params into a translated sentence.
    """
    checks: list[dict] = []

    def add(area: str, status: str, code: str, **params):
        checks.append({"area": area, "status": status, "code": code, "params": params})

    # Playback: can the backend actually read the audio files?
    for d in dirs:
        params = {"setting": d["setting"], "path": d["path"]}
        if not d["exists"]:
            add("playback", "error", "music_dir_missing", **params)
        elif d["audio_files"] == 0:
            add("playback", "warning", "music_dir_empty", **params)
        else:
            add("playback", "ok", "music_dir_ok", count=d["audio_files"], **params)
    if catalogue["missing_files"]:
        add("playback", "error", "missing_files", missing=catalogue["missing_files"], total=catalogue["local_files"])
    if catalogue.get("mergeable"):
        add("playback", "warning", "duplicate_missing", count=catalogue["mergeable"])
    elif catalogue["local_files"]:
        add("playback", "ok", "files_ok", total=catalogue["local_files"])
    if catalogue.get("purgeable"):
        add("playback", "warning", "catalogue_clutter", count=catalogue["purgeable"])
    else:
        add("playback", "ok", "catalogue_clean")
    if catalogue["hls"]:
        add("playback", "ok", "hls_ok", count=catalogue["hls"])
    elif catalogue["total"] > catalogue["no_audio"]:
        add("playback", "info", "no_hls")

    # Backing services.
    service_area = {"database": "database", "redis": "database", "minio": "storage", "meilisearch": "search"}
    for name, status in services.items():
        area = service_area.get(name, "database")
        if status["ok"]:
            add(area, "ok", f"{name}_ok")
        else:
            add(area, "error", f"{name}_down", detail=status.get("detail") or "")

    # Accounts.
    if users["admins"] <= 1:
        add("accounts", "info", "single_admin")
    else:
        add("accounts", "ok", "admins_ok", count=users["admins"])
    if settings.OPEN_REGISTRATION:
        add("accounts", "info", "open_registration")
    else:
        add("accounts", "ok", "registration_invite_only")

    # Security.
    if settings.MINIO_ACCESS_KEY in _DEFAULT_CREDENTIALS or settings.MINIO_SECRET_KEY in _DEFAULT_CREDENTIALS:
        add("security", "warning", "default_minio_credentials")
    else:
        add("security", "ok", "minio_credentials_ok")
    if settings.MEILISEARCH_MASTER_KEY in _DEFAULT_CREDENTIALS:
        add("security", "warning", "default_meili_key")
    else:
        add("security", "ok", "meili_key_ok")
    if settings.DEBUG:
        add("security", "warning", "debug")
    else:
        add("security", "ok", "debug_off")
    if "*" in settings.cors_origins_list:
        add("security", "info", "cors_wildcard")
    else:
        add("security", "ok", "cors_restricted", origins=settings.CORS_ORIGINS)

    return checks


def _areas(checks: list[dict]) -> list[dict]:
    """Worst status per area, with its problem count."""
    areas = []
    for area in AREAS:
        mine = [c for c in checks if c["area"] == area]
        status = max((c["status"] for c in mine), key=_STATUS_RANK.__getitem__, default="ok")
        problems = sum(1 for c in mine if c["status"] in ("warning", "error"))
        areas.append({"area": area, "status": status, "problems": problems})
    return areas


async def get_overview(db: AsyncSession) -> dict:
    users = await _users_summary(db)
    catalogue = await _catalogue_summary(db)
    catalogue["purgeable"] = (await purge_unplayable_tracks(db, dry_run=True))["count"]
    catalogue["mergeable"] = (await merge_missing_duplicates(db, dry_run=True))["count"] if catalogue["missing_files"] else 0
    dirs = []
    for setting, path in music_dirs():
        info = await asyncio.to_thread(_inspect_dir, path)
        dirs.append({"setting": setting, **info})
    services = await _services_status(db)
    checks = _checks(catalogue, dirs, services, users)
    return {
        "generated_at": _utcnow().isoformat(),
        "users": users,
        "catalogue": catalogue,
        "music_dirs": dirs,
        "services": services,
        "config": _config(),
        "areas": _areas(checks),
        "checks": checks,
        # Kept for API clients that only want the problems.
        "warnings": [
            {"level": c["status"], "code": c["code"], "params": c["params"]} for c in checks if c["status"] != "ok"
        ],
    }


async def purge_unplayable_tracks(
    db: AsyncSession, dry_run: bool = True, include_used: bool = False, include_orphans: bool = False
) -> dict:
    """Tracks without audio (search leftovers).

    By default only those nothing points to, so nothing a user saved
    disappears. ``include_used`` also removes the ones sitting in playlists,
    favorites, history or jams (they cannot be played anyway).
    ``include_orphans`` then removes the albums and artists left without
    any track. ``dry_run`` only counts them.
    """
    from sqlalchemy import exists

    from app.models.favorite import Favorite
    from app.models.jam import JamSession
    from app.models.playlist_track import PlaylistTrack
    from app.utils.track_cleanup import delete_orphan_catalogue, delete_tracks, orphan_catalogue

    conditions = [Track.file_url.is_(None), Track.hls_path.is_(None)]
    if not include_used:
        conditions += [
            ~exists().where(PlaylistTrack.track_id == Track.id),
            ~exists().where(ListeningHistory.track_id == Track.id),
            ~exists().where(Favorite.entity_type == "track", Favorite.entity_id == Track.id),
            ~exists().where(JamSession.current_track_id == Track.id),
        ]
    ids = list((await db.execute(select(Track.id).where(*conditions))).scalars().all())
    result = {"count": len(ids), "deleted": 0 if dry_run else len(ids)}
    if not dry_run and ids:
        await delete_tracks(db, ids)
    if include_orphans:
        # Albums/artists left without any track would only open empty pages.
        if dry_run:
            albums, artists = (len(x) for x in await orphan_catalogue(db, ignoring_tracks=ids))
        else:
            albums, artists = await delete_orphan_catalogue(db)
        result.update(orphan_albums=albums, orphan_artists=artists)
    return result


_KNOWN_ROOTS = ("/music", "/app/downloads")


def _relative_key(path: str, roots: list[str]) -> str:
    """Path relative to its music root, so /music/X and /app/downloads/X match.

    Unknown roots fall back to the last three components (artist/album/file).
    """
    normalized = path.replace("\\", "/")
    for root in roots:
        root = root.replace("\\", "/").rstrip("/")
        if normalized.startswith(root + "/"):
            return normalized[len(root) + 1:].lower()
    return "/".join(normalized.split("/")[-3:]).lower()


# Bracketed parts that only describe the upload, not the recording:
# "(Official Video)", "[Lyrics]", "(Remastered 2011)".
_BRACKETS = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")
_NOISE_WORD = re.compile(r"\b(?:official|officiel|lyrics?|paroles|audio|video|clip|visuali[sz]er|hd|hq|4k|remaster(?:ed)?)\b")
# ...unless they name another recording: "(Live At O2 Arena / Remastered 2023)"
# is a live version, not a remaster of the studio one.
_VERSION_WORD = re.compile(
    r"\b(?:live|remix|mix|edit|acoustic|acoustique|instrumental|unplugged|demo|version|cover|a ?cappella|extended|session|orchestral)\b"
)
_TITLE_NOISE_WORDS = re.compile(r"\b(?:official (?:music )?video|official audio|clip officiel|lyrics? video)\b")
# Durations are not a criterion: the same song lasts 3:56 on the album and
# 4:19 as a YouTube clip with an intro, and listeners see both as duplicates.
# Other versions are told apart by their title ("Live", "Remix"...).
# Except titles many different songs share (one "Intro" per album): those
# are only merged when practically the same length.
_GENERIC_TITLES = {"intro", "outro", "interlude", "skit", "prelude", "prologue", "epilogue", "bonus", "untitled", "instrumental"}
_GENERIC_TOLERANCE = 1


def _fold(text: str) -> str:
    # Typographic apostrophes would vanish below instead of separating words.
    text = text.replace("’", "'").replace("‘", "'")
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()


def _drop_noise_brackets(match: re.Match) -> str:
    inside = match.group(1)
    if _NOISE_WORD.search(inside) and not _VERSION_WORD.search(inside):
        return " "
    return match.group(0)


def normalize_title(title: str, artist_name: str = "") -> str:
    """Comparable form of a title: no accents, case, punctuation, upload noise
    ("(Official Video)") nor leading "Artist - ". Versions ("(Live)",
    "(Remix)") stay part of the title."""
    text = _BRACKETS.sub(_drop_noise_brackets, _fold(title or ""))
    text = _TITLE_NOISE_WORDS.sub(" ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    artist = re.sub(r"[^a-z0-9]+", " ", _fold(artist_name or "")).strip()
    if artist and text.startswith(artist + " "):
        text = text[len(artist) + 1:]
    return text


def _same_duration_clusters(tracks: list[Track], tolerance: int = _GENERIC_TOLERANCE) -> list[list[Track]]:
    """Split one title's tracks into groups of compatible durations (each
    within ``tolerance`` seconds of the shortest of its group)."""
    known = sorted((t for t in tracks if t.duration_seconds), key=lambda t: t.duration_seconds)
    unknown = [t for t in tracks if not t.duration_seconds]
    clusters: list[list[Track]] = []
    for t in known:
        base = clusters[-1][0].duration_seconds if clusters else None
        if base is not None and t.duration_seconds - base <= tolerance:
            clusters[-1].append(t)
        else:
            clusters.append([t])
    # No duration to compare: assume the same song as the main version.
    if unknown:
        if clusters:
            max(clusters, key=len).extend(unknown)
        else:
            clusters.append(unknown)
    return clusters


def _keep_rank(t: Track, exists: dict, paths: dict) -> tuple:
    """Sort key of the copy to keep: playable, lossless, from the music folders
    (not a YouTube download), already in HLS, in an album, most played."""
    path = paths[t.id].lower()
    return (
        not exists[t.id],
        not path.endswith(".flac"),
        "/app/downloads/" in path.replace("\\", "/"),
        not t.hls_path,
        t.album_id is None,
        -(t.play_count or 0),
        str(t.id),
    )


def _find_duplicate_pairs(
    rows: list[Track],
    exists: dict,
    paths: dict,
    roots: list[str],
    include_alive: bool,
    artist_names: dict | None = None,
) -> tuple[list[tuple[Track, Track]], int]:
    """Pairs to merge, and the missing tracks left without any live twin.

    Two kinds of duplicates:
    1. the same file scanned from two roots, where one copy's file is gone;
    2. the same song stored twice with both files still there: same artist
       and same title once normalized (only when ``include_alive`` is set).
       Typically a song on an album, a deluxe edition and as a single, or in
       the music folder and downloaded again from YouTube as a longer clip.
    """
    artist_names = artist_names or {}
    pairs: list[tuple[Track, Track]] = []
    claimed: set = set()

    live_by_key: dict[str, Track] = {}
    for t in rows:
        if exists[t.id]:
            live_by_key.setdefault(_relative_key(paths[t.id], roots), t)

    orphaned: list[Track] = []
    for t in rows:
        if exists[t.id]:
            continue
        target = live_by_key.get(_relative_key(paths[t.id], roots))
        if target is None:
            orphaned.append(t)
        else:
            pairs.append((t, target))
            claimed.update((t.id, target.id))

    if include_alive:
        groups: dict[tuple, list[Track]] = {}
        for t in rows:
            if t.id in claimed:
                continue
            title = normalize_title(t.title, artist_names.get(str(t.artist_id), ""))
            if title:
                groups.setdefault((str(t.artist_id), title), []).append(t)
        for (_artist, title), group in groups.items():
            if len(group) < 2:
                continue
            clusters = _same_duration_clusters(group) if title in _GENERIC_TITLES else [group]
            for cluster in clusters:
                if len(cluster) < 2:
                    continue
                survivor = min(cluster, key=lambda t: _keep_rank(t, exists, paths))
                if not exists[survivor.id]:
                    continue
                for t in cluster:
                    if t.id != survivor.id:
                        pairs.append((t, survivor))
                claimed.update(t.id for t in cluster)

    dup_ids = {dup.id for dup, _target in pairs}
    unresolved = sum(1 for t in orphaned if t.id not in dup_ids)
    return pairs, unresolved


async def _merge_duplicates(db: AsyncSession, dry_run: bool = True, include_alive: bool = False) -> dict:
    from sqlalchemy import delete, update

    from app.models.favorite import Favorite
    from app.models.jam import JamSession
    from app.models.playlist_track import PlaylistTrack

    roots = sorted({*(p for _, p in music_dirs()), *_KNOWN_ROOTS}, key=len, reverse=True)
    rows = (
        await db.execute(select(Track).where(Track.file_url.startswith(LOCAL_PREFIX)))
    ).scalars().all()
    paths = {t.id: t.file_url[len(LOCAL_PREFIX):] for t in rows}
    exists = await asyncio.to_thread(lambda: {tid: os.path.isfile(p) for tid, p in paths.items()})

    artist_names: dict = {}
    if include_alive:
        from app.models.artist import Artist

        artist_names = {
            str(artist_id): name
            for artist_id, name in (
                await db.execute(select(Artist.id, Artist.name).where(Artist.id.in_({t.artist_id for t in rows})))
            ).all()
        }
    pairs, unresolved = _find_duplicate_pairs(rows, exists, paths, roots, include_alive, artist_names)

    result = {
        "count": len(pairs),
        "merged": 0,
        "unresolved": unresolved,
        "examples": [{"from": paths[d.id], "to": paths[t.id]} for d, t in pairs[:5]],
    }
    if dry_run or not pairs:
        return result

    for dup, target in pairs:
        # Playlists: the (playlist_id, track_id) primary key forbids two rows
        # for the same playlist, so drop the dead row where both are present.
        in_playlists = set(
            (await db.execute(select(PlaylistTrack.playlist_id).where(PlaylistTrack.track_id == target.id))).scalars()
        )
        if in_playlists:
            await db.execute(
                delete(PlaylistTrack).where(
                    PlaylistTrack.track_id == dup.id, PlaylistTrack.playlist_id.in_(in_playlists)
                )
            )
        await db.execute(update(PlaylistTrack).where(PlaylistTrack.track_id == dup.id).values(track_id=target.id))

        # Favorites: same idea, one favorite per user and track.
        fav_users = set(
            (
                await db.execute(
                    select(Favorite.user_id).where(Favorite.entity_type == "track", Favorite.entity_id == target.id)
                )
            ).scalars()
        )
        if fav_users:
            await db.execute(
                delete(Favorite).where(
                    Favorite.entity_type == "track", Favorite.entity_id == dup.id, Favorite.user_id.in_(fav_users)
                )
            )
        await db.execute(
            update(Favorite)
            .where(Favorite.entity_type == "track", Favorite.entity_id == dup.id)
            .values(entity_id=target.id)
        )

        await db.execute(update(ListeningHistory).where(ListeningHistory.track_id == dup.id).values(track_id=target.id))
        await db.execute(update(JamSession).where(JamSession.current_track_id == dup.id).values(current_track_id=target.id))

        target.play_count = (target.play_count or 0) + (dup.play_count or 0)
        if not target.lyrics_lrc and dup.lyrics_lrc:
            target.lyrics_lrc = dup.lyrics_lrc
        if not target.cover_url and dup.cover_url:
            target.cover_url = dup.cover_url
        await db.delete(dup)
        result["merged"] += 1

    await db.flush()
    return result


async def merge_missing_duplicates(db: AsyncSession, dry_run: bool = True) -> dict:
    """Merge tracks whose local file is gone into the copy that still exists.

    The same library was once scanned from two roots (/music and
    /app/downloads): one copy of each track now points to a missing file.
    Everything users attached to the dead copy (playlists, favorites,
    history, jams, play count, lyrics, cover) moves to the live one, then the
    dead copy is deleted. ``dry_run`` only counts.
    """
    return await _merge_duplicates(db, dry_run=dry_run, include_alive=False)


async def merge_duplicates(db: AsyncSession, dry_run: bool = True) -> dict:
    """Every duplicate pair of local tracks: dead copies of a file, and the
    same song stored twice while both files still exist.

    Only database rows are merged, never files on disk: the surviving track
    keeps its file and the scanner skips the other one on the next run.
    """
    return await _merge_duplicates(db, dry_run=dry_run, include_alive=True)
