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
        services["database"] = {"ok": False, "detail": str(e)[:200]}

    try:
        from app.core.redis import get_redis

        await asyncio.wait_for((await get_redis()).ping(), timeout=2)
        services["redis"] = {"ok": True}
    except Exception as e:  # noqa: BLE001
        services["redis"] = {"ok": False, "detail": str(e)[:200]}

    try:
        from app.core.minio import get_minio_client

        exists = await asyncio.to_thread(get_minio_client().bucket_exists, settings.MINIO_BUCKET)
        services["minio"] = {"ok": bool(exists), "detail": None if exists else f"bucket {settings.MINIO_BUCKET} missing"}
    except Exception as e:  # noqa: BLE001
        services["minio"] = {"ok": False, "detail": str(e)[:200]}

    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{settings.MEILISEARCH_URL}/health")
        services["meilisearch"] = {"ok": response.status_code == 200}
    except Exception as e:  # noqa: BLE001
        services["meilisearch"] = {"ok": False, "detail": str(e)[:200]}

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


def _warnings(catalogue: dict, dirs: list[dict], services: dict, users: dict) -> list[dict]:
    """Codes + params: the frontend turns them into translated messages."""
    warnings: list[dict] = []

    def add(level: str, code: str, **params):
        warnings.append({"level": level, "code": code, "params": params})

    for name, status in services.items():
        if not status["ok"]:
            add("error", "service_down", service=name)
    for d in dirs:
        if not d["exists"]:
            add("error", "music_dir_missing", setting=d["setting"], path=d["path"])
        elif d["audio_files"] == 0:
            add("warning", "music_dir_empty", setting=d["setting"], path=d["path"])
    if catalogue["missing_files"]:
        add("error", "missing_files", missing=catalogue["missing_files"], total=catalogue["local_files"])
    if catalogue["hls"] == 0 and catalogue["total"] > catalogue["no_audio"]:
        add("info", "no_hls")
    if settings.MINIO_ACCESS_KEY in _DEFAULT_CREDENTIALS or settings.MINIO_SECRET_KEY in _DEFAULT_CREDENTIALS:
        add("warning", "default_minio_credentials")
    if settings.MEILISEARCH_MASTER_KEY in _DEFAULT_CREDENTIALS:
        add("warning", "default_meili_key")
    if settings.DEBUG:
        add("warning", "debug")
    if settings.OPEN_REGISTRATION:
        add("info", "open_registration")
    if "*" in settings.cors_origins_list:
        add("info", "cors_wildcard")
    if users["admins"] <= 1:
        add("info", "single_admin")
    return warnings


async def get_overview(db: AsyncSession) -> dict:
    users = await _users_summary(db)
    catalogue = await _catalogue_summary(db)
    dirs = []
    for setting, path in music_dirs():
        info = await asyncio.to_thread(_inspect_dir, path)
        dirs.append({"setting": setting, **info})
    services = await _services_status(db)
    return {
        "generated_at": _utcnow().isoformat(),
        "users": users,
        "catalogue": catalogue,
        "music_dirs": dirs,
        "services": services,
        "config": _config(),
        "warnings": _warnings(catalogue, dirs, services, users),
    }
