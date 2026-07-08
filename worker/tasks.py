import os
import subprocess
import json
import tempfile
from pathlib import Path

from celery_app import app
from mutagen import File as MutagenFile


@app.task(bind=True, max_retries=3)
def transcode_audio(self, input_path: str, output_prefix: str, track_id: str):
    """Transcode audio file to HLS with multiple bitrates, upload segments to MinIO."""
    from minio import Minio
    from io import BytesIO
    import urllib.request

    # Download source file from MinIO to temp
    client = Minio(
        os.getenv("MINIO_ENDPOINT", "minio:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
    )
    bucket = os.getenv("MINIO_BUCKET", "alt-spotify")

    tmp_input = tempfile.NamedTemporaryFile(delete=False, suffix=Path(input_path).suffix)
    try:
        client.fget_object(bucket, input_path, tmp_input.name)
    except Exception as e:
        return {"error": f"Failed to download source: {e}"}
    tmp_input.close()

    bitrates = {
        "128k": "128k",
        "192k": "192k",
        "320k": "320k",
    }

    results = {}
    tmp_dir = tempfile.mkdtemp()

    try:
        for quality, bitrate in bitrates.items():
            variant_dir = os.path.join(tmp_dir, quality)
            os.makedirs(variant_dir, exist_ok=True)

            playlist_path = os.path.join(variant_dir, "playlist.m3u8")
            segment_pattern = os.path.join(variant_dir, "segment_%03d.ts")

            cmd = [
                "ffmpeg", "-y", "-i", tmp_input.name,
                "-c:a", "aac", "-b:a", bitrate,
                "-f", "hls",
                "-hls_time", "6",
                "-hls_list_size", "0",
                "-hls_segment_filename", segment_pattern,
                playlist_path,
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=600)
            except subprocess.CalledProcessError as e:
                print(f"Transcoding failed for {quality}: {e.stderr.decode()}")
                continue
            except subprocess.TimeoutExpired:
                print(f"Transcoding timeout for {quality}")
                self.retry(countdown=60)
                return

            # Upload playlist to MinIO
            playlist_key = f"{output_prefix}/{quality}/playlist.m3u8"
            client.fput_object(bucket, playlist_key, playlist_path, content_type="application/vnd.apple.mpegurl")

            # Upload segments to MinIO
            for seg_file in sorted(Path(variant_dir).glob("segment_*.ts")):
                seg_key = f"{output_prefix}/{quality}/{seg_file.name}"
                client.fput_object(bucket, seg_key, str(seg_file), content_type="video/mp2t")

            results[quality] = {
                "playlist": f"{quality}/playlist.m3u8",
                "segment_pattern": f"{quality}/segment_%03d.ts",
            }

        # Create and upload master playlist
        master_content = "#EXTM3U\n"
        for quality, bitrate in bitrates.items():
            if quality in results:
                bandwidth = int(bitrate.replace("k", "")) * 1000
                master_content += f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth}\n"
                master_content += f"{quality}/playlist.m3u8\n"

        master_path = os.path.join(tmp_dir, "master.m3u8")
        with open(master_path, "w") as f:
            f.write(master_content)

        master_key = f"{output_prefix}/master.m3u8"
        client.fput_object(bucket, master_key, master_path, content_type="application/vnd.apple.mpegurl")

        return {
            "track_id": track_id,
            "master_playlist": master_key,
            "variants": results,
            "hls_path": output_prefix,
        }

    finally:
        # Cleanup temp files
        import shutil
        try:
            os.unlink(tmp_input.name)
        except Exception:
            pass
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


@app.task(bind=True, max_retries=3)
def generate_waveform(self, input_path: str, output_path: str, track_id: str):
    """Generate waveform visualization data from audio file."""
    try:
        audio = MutagenFile(input_path)
        if audio is None:
            return {"error": "Could not read audio file"}

        cmd = [
            "ffmpeg", "-i", input_path,
            "-filter:a", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
            "-f", "null", "-"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        levels = []
        for line in result.stderr.split("\n"):
            if "RMS_level" in line:
                try:
                    level = float(line.split("=")[1].strip())
                    levels.append(max(level, -100))
                except (ValueError, IndexError):
                    continue

        waveform_data = {
            "track_id": track_id,
            "sample_count": len(levels),
            "samples": levels[:1000],
        }

        with open(output_path, "w") as f:
            json.dump(waveform_data, f)

        return {"track_id": track_id, "output": output_path}

    except Exception as e:
        print(f"Waveform generation failed: {e}")
        self.retry(countdown=30)


@app.task(bind=True, max_retries=2)
def process_upload(self, file_path: str, track_id: str):
    """Process uploaded audio file: extract metadata and trigger transcoding."""
    try:
        audio = MutagenFile(file_path, easy=True)

        metadata = {}
        if audio:
            metadata = {
                "title": audio.get("title", [Path(file_path).stem])[0],
                "artist": audio.get("artist", ["Unknown"])[0],
                "album": audio.get("album", ["Unknown"])[0],
                "genre": audio.get("genre", ["Unknown"])[0],
                "duration": audio.info.length if audio.info else 0,
                "track_number": audio.get("tracknumber", ["0"])[0],
            }

        output_prefix = f"hls/{track_id}"
        transcode_audio.delay(file_path, output_prefix, track_id)

        return {
            "track_id": track_id,
            "metadata": metadata,
            "status": "processing",
        }

    except Exception as e:
        print(f"Upload processing failed: {e}")
        self.retry(countdown=60)


@app.task
def cleanup_old_hls(days_old: int = 30):
    """Remove HLS segments older than specified days from MinIO."""
    from minio import Minio
    from datetime import datetime, timedelta, timezone

    client = Minio(
        os.getenv("MINIO_ENDPOINT", "minio:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
    )
    bucket = os.getenv("MINIO_BUCKET", "alt-spotify")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_old)

    objects = client.list_objects(bucket, prefix="hls/", recursive=True)
    removed = 0
    for obj in objects:
        if obj.last_modified and obj.last_modified.replace(tzinfo=timezone.utc) < cutoff:
            client.remove_object(bucket, obj.object_name)
            removed += 1

    return {"removed_count": removed}
