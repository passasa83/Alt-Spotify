"""Files the backend may serve from disk: only what lives in the music folders."""
import os

_LEGACY_ROOTS = ("/music", "/app/downloads")


def music_roots() -> list[str]:
    """Real paths of the mounted music folders (scan + YouTube downloads)."""
    roots = {
        os.environ.get("MUSIC_SCAN_DIR", "/music"),
        os.environ.get("MUSIC_DOWNLOAD_DIR", "/app/downloads"),
        *_LEGACY_ROOTS,
    }
    return [os.path.realpath(r) for r in roots if r and os.path.isdir(r)]


def is_inside(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:  # different drives on Windows
        return False


def safe_music_file(path: str) -> str | None:
    """Real path of an existing file inside a music folder, else None."""
    real = os.path.realpath(path)
    if os.path.isfile(real) and any(is_inside(real, root) for root in music_roots()):
        return real
    return None
