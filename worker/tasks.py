import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from celery_app import app
from mutagen import File as MutagenFile

# (quality label used in URLs, AAC bitrate in kbps). The labels must match
# the qualities accepted by the backend stream endpoints.
HLS_VARIANTS = [("128k", 128), ("192k", 192), ("320k", 320)]
HLS_SEGMENT_SECONDS = 6
# Tracks from the music folders / YouTube downloads (same convention as the backend).
LOCAL_PREFIX = "local:"
FFMPEG_TIMEOUT = 600


def _minio_client():
    from minio import Minio

    return Minio(
        os.getenv("MINIO_ENDPOINT", "minio:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
    )


def _bucket() -> str:
    return os.getenv("MINIO_BUCKET", "alt-spotify")


def _set_hls_path(track_id: str, hls_path: str) -> int:
    """Mark the track as HLS-ready; return the number of rows updated."""
    import psycopg

    # The backend uses the asyncpg driver; psycopg wants a plain libpq URL.
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)
    with psycopg.connect(url) as conn:
        cur = conn.execute("UPDATE tracks SET hls_path = %s WHERE id = %s", (hls_path, track_id))
        return cur.rowcount


def _source_bitrate_kbps(path: str) -> int | None:
    try:
        audio = MutagenFile(path)
    except Exception:
        return None
    bitrate = getattr(getattr(audio, "info", None), "bitrate", 0) or 0
    return bitrate // 1000 or None


def _pick_variants(source_kbps: int | None) -> list[tuple[str, int]]:
    """Skip variants that would only upsample a lossy source (keep at least one)."""
    if not source_kbps:
        return HLS_VARIANTS
    # 10% tolerance: a "320k" MP3 or a VBR file often reports slightly less.
    picked = [v for v in HLS_VARIANTS if v[1] <= source_kbps * 1.1]
    return picked or HLS_VARIANTS[:1]


def _ffmpeg_hls_cmd(source: str, kbps: int, out_dir: str) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", source,
        # Audio only: embedded cover art would otherwise end up as a video stream.
        "-map", "0:a:0", "-vn",
        "-c:a", "aac", "-b:a", f"{kbps}k", "-ac", "2",
        "-f", "hls",
        "-hls_time", str(HLS_SEGMENT_SECONDS),
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", os.path.join(out_dir, "segment_%03d.ts"),
        os.path.join(out_dir, "playlist.m3u8"),
    ]


def _master_playlist(variants: list[tuple[str, int]]) -> str:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for label, kbps in variants:
        # ~10% on top of the audio bitrate for MPEG-TS overhead.
        bandwidth = int(kbps * 1000 * 1.1)
        lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},CODECS="mp4a.40.2"')
        lines.append(f"{label}/playlist.m3u8")
    return "\n".join(lines) + "\n"


@app.task(bind=True, name="tasks.transcode_audio", max_retries=3)
def transcode_audio(self, input_path: str, output_prefix: str, track_id: str):
    """Transcode a track's source file to multi-bitrate HLS.

    ``input_path`` is a MinIO object name, or ``local:<path>`` for files from
    the music folders mounted read-only in this container.

    Segments and playlists are uploaded under ``output_prefix``, then
    ``tracks.hls_path`` is set so the players switch to HLS.
    """
    client = _minio_client()
    bucket = _bucket()
    work_dir = tempfile.mkdtemp(prefix="hls-")

    try:
        if input_path.startswith(LOCAL_PREFIX):
            source = input_path[len(LOCAL_PREFIX):]
            if not os.path.isfile(source):
                # Not retried: the folder isn't mounted here or the file is gone.
                raise FileNotFoundError(f"Local source not found in worker: {source}")
        else:
            source = os.path.join(work_dir, "source" + Path(input_path).suffix)
            try:
                client.fget_object(bucket, input_path, source)
            except Exception as e:
                raise self.retry(exc=e, countdown=30)

        done = []
        for label, kbps in _pick_variants(_source_bitrate_kbps(source)):
            out_dir = os.path.join(work_dir, label)
            os.makedirs(out_dir)
            try:
                subprocess.run(_ffmpeg_hls_cmd(source, kbps, out_dir), check=True, capture_output=True, timeout=FFMPEG_TIMEOUT)
            except subprocess.TimeoutExpired as e:
                raise self.retry(exc=e, countdown=60)
            except subprocess.CalledProcessError as e:
                print(f"[{track_id}] ffmpeg failed for {label}: {e.stderr.decode(errors='replace')[-2000:]}")
                continue

            # Segments before the playlist that references them.
            for seg_file in sorted(Path(out_dir).glob("segment_*.ts")):
                client.fput_object(bucket, f"{output_prefix}/{label}/{seg_file.name}", str(seg_file), content_type="video/mp2t")
            client.fput_object(
                bucket, f"{output_prefix}/{label}/playlist.m3u8",
                os.path.join(out_dir, "playlist.m3u8"),
                content_type="application/vnd.apple.mpegurl",
            )
            done.append((label, kbps))

        if not done:
            # Not retried: the source file itself is unreadable by ffmpeg.
            raise RuntimeError(f"ffmpeg could not transcode {input_path} to any HLS variant")

        master_path = os.path.join(work_dir, "master.m3u8")
        with open(master_path, "w") as f:
            f.write(_master_playlist(done))
        client.fput_object(bucket, f"{output_prefix}/master.m3u8", master_path, content_type="application/vnd.apple.mpegurl")

        if _set_hls_path(track_id, output_prefix) == 0:
            print(f"[{track_id}] track not found in database, HLS files left under {output_prefix}")

        return {
            "track_id": track_id,
            "hls_path": output_prefix,
            "variants": [label for label, _ in done],
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.task(name="tasks.cleanup_orphaned_hls")
def cleanup_orphaned_hls(min_age_hours: int = 24):
    """Delete HLS files that no track references anymore (deleted tracks).

    Files younger than ``min_age_hours`` are kept: a transcode may still be
    uploading them before ``tracks.hls_path`` is set.
    """
    import psycopg
    from datetime import datetime, timedelta, timezone

    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)
    with psycopg.connect(url) as conn:
        referenced = {row[0] for row in conn.execute("SELECT hls_path FROM tracks WHERE hls_path IS NOT NULL")}

    client = _minio_client()
    bucket = _bucket()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=min_age_hours)
    removed = 0
    for obj in client.list_objects(bucket, prefix="hls/", recursive=True):
        # Object names look like hls/<track_id>/<quality>/segment_000.ts
        prefix = "/".join(obj.object_name.split("/")[:2])
        if prefix in referenced:
            continue
        if obj.last_modified and obj.last_modified.replace(tzinfo=timezone.utc) > cutoff:
            continue
        client.remove_object(bucket, obj.object_name)
        removed += 1

    return {"removed_count": removed}
