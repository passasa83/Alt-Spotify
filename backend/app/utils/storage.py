import os


def get_storage_used() -> str:
    for path in ["/", "/data", "/app"]:
        try:
            stat = os.statvfs(path)
            used = (stat.f_blocks - stat.f_bfree) * stat.f_frsize
            if used > 0:
                gb = used / (1024 ** 3)
                return f"{gb:.1f} GB"
        except (OSError, AttributeError):
            continue
    return "N/A"


def get_disk_usage() -> dict:
    for path in ["/", "/data", "/app"]:
        try:
            stat = os.statvfs(path)
            return {
                "total_bytes": stat.f_blocks * stat.f_frsize,
                "free_bytes": stat.f_bavail * stat.f_frsize,
                "used_bytes": (stat.f_blocks - stat.f_bfree) * stat.f_frsize,
                "usage_percent": round(((stat.f_blocks - stat.f_bavail) / stat.f_blocks) * 100, 2) if stat.f_blocks else 0,
            }
        except (OSError, AttributeError):
            continue
    return {}
