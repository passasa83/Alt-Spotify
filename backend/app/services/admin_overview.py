"""Instance health for the admin overview: users, catalogue availability,
music folders, backing services, configuration and the warnings they raise."""

import asyncio
import os
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


async def purge_unplayable_tracks(db: AsyncSession, dry_run: bool = True) -> dict:
    """Tracks without audio that nothing points to (search leftovers).

    Kept: tracks in a playlist, a favorite, someone's history or a jam, so
    nothing a user saved disappears. ``dry_run`` only counts them.
    """
    from sqlalchemy import delete, exists

    from app.models.favorite import Favorite
    from app.models.jam import JamSession
    from app.models.playlist_track import PlaylistTrack

    unplayable = select(Track.id).where(
        Track.file_url.is_(None),
        Track.hls_path.is_(None),
        ~exists().where(PlaylistTrack.track_id == Track.id),
        ~exists().where(ListeningHistory.track_id == Track.id),
        ~exists().where(Favorite.entity_type == "track", Favorite.entity_id == Track.id),
        ~exists().where(JamSession.current_track_id == Track.id),
    )
    ids = list((await db.execute(unplayable)).scalars().all())
    if not dry_run and ids:
        await db.execute(delete(Track).where(Track.id.in_(ids)))
        await db.flush()
    return {"count": len(ids), "deleted": 0 if dry_run else len(ids)}


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


async def merge_missing_duplicates(db: AsyncSession, dry_run: bool = True) -> dict:
    """Merge tracks whose local file is gone into the copy that still exists.

    The same library was once scanned from two roots (/music and
    /app/downloads): one copy of each track now points to a missing file.
    Everything users attached to the dead copy (playlists, favorites,
    history, jams, play count, lyrics, cover) moves to the live one, then the
    dead copy is deleted. ``dry_run`` only counts.
    """
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

    live_by_key: dict[str, Track] = {}
    for t in rows:
        if exists[t.id]:
            live_by_key.setdefault(_relative_key(paths[t.id], roots), t)

    pairs: list[tuple[Track, Track]] = []
    unresolved = 0
    for t in rows:
        if exists[t.id]:
            continue
        target = live_by_key.get(_relative_key(paths[t.id], roots))
        if target is None:
            unresolved += 1
        else:
            pairs.append((t, target))

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
