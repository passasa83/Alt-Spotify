import subprocess
import tempfile
import uuid

from app.core.minio import get_file_url


def analyze_track(file_url: str) -> dict | None:
    try:
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=True) as tmp:
            import httpx
            resp = httpx.get(file_url, timeout=60)
            resp.raise_for_status()
            tmp.write(resp.content)
            tmp.flush()

            result = subprocess.run(
                [
                    "ffmpeg",
                    "-i",
                    tmp.name,
                    "-af",
                    "replaygain",
                    "-f",
                    "null",
                    "-",
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )

            output = result.stderr
            track_gain = None
            track_peak = None
            album_gain = None

            for line in output.splitlines():
                line_lower = line.lower()
                if "track gain" in line_lower:
                    parts = line.split(":")
                    if len(parts) > 1:
                        try:
                            track_gain = float(parts[1].strip().replace(" dB", ""))
                        except ValueError:
                            pass
                elif "track peak" in line_lower:
                    parts = line.split(":")
                    if len(parts) > 1:
                        try:
                            track_peak = float(parts[1].strip())
                        except ValueError:
                            pass
                elif "album gain" in line_lower:
                    parts = line.split(":")
                    if len(parts) > 1:
                        try:
                            album_gain = float(parts[1].strip().replace(" dB", ""))
                        except ValueError:
                            pass

            if track_gain is not None:
                return {
                    "track_gain": track_gain,
                    "track_peak": track_peak,
                    "album_gain": album_gain,
                }
    except Exception:
        pass
    return None


def get_replaygain_info(track_id: uuid.UUID, file_url: str | None) -> dict | None:
    if not file_url:
        return None

    url = get_file_url(file_url)
    return analyze_track(url)
