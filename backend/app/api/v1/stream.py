import asyncio
import os
import re
import uuid
from collections.abc import Callable, Iterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.minio import get_minio_client
from app.models.track import Track
from app.models.user import User
from app.utils.deps import get_current_user_stream
from app.utils.local_files import safe_music_file
from app.utils.track_access import get_track_for_user

router = APIRouter(prefix="/stream", tags=["stream"])

# Tracks from the music folders / YouTube downloads: ``local:<path on the server>``.
LOCAL_PREFIX = "local:"

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
_CHUNK_SIZE = 64 * 1024

_AUDIO_CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "opus": "audio/ogg",
}


def _content_type_for(name: str, stat_content_type=None) -> str:
    if isinstance(stat_content_type, str) and stat_content_type and stat_content_type != "application/octet-stream":
        return stat_content_type
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return _AUDIO_CONTENT_TYPES.get(ext, "audio/mpeg")


def _ranged_response(
    request: Request,
    total_size: int,
    media_type: str,
    read_range: Callable[[int, int], Iterator[bytes]],
) -> Response:
    """Serve ``total_size`` bytes, honouring an HTTP ``Range`` header.

    ``read_range(start, length)`` yields the requested bytes.
    """
    headers = {"Accept-Ranges": "bytes"}
    start, end = 0, max(total_size - 1, 0)
    response_status = status.HTTP_200_OK

    range_header = request.headers.get("range")
    match = _RANGE_RE.match(range_header.strip()) if range_header else None
    if match and (match.group(1) or match.group(2)):
        first, last = match.group(1), match.group(2)
        if first:
            start = int(first)
            end = int(last) if last else total_size - 1
        else:
            start = max(total_size - int(last), 0)
            end = total_size - 1
        if start >= total_size or start > end:
            return Response(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{total_size}"},
            )
        end = min(end, total_size - 1)
        response_status = status.HTTP_206_PARTIAL_CONTENT
        headers["Content-Range"] = f"bytes {start}-{end}/{total_size}"

    length = end - start + 1
    headers["Content-Length"] = str(length)
    return StreamingResponse(read_range(start, length), status_code=response_status, media_type=media_type, headers=headers)


def stream_object_response(request: Request, object_name: str) -> Response:
    """Proxy an object stored in MinIO with HTTP Range support.

    The audio element of the browser cannot send an Authorization header, so
    this helper is only ever reached after the caller validated the JWT
    (header or ``?token=`` query parameter).
    """
    client = get_minio_client()
    try:
        stat = client.stat_object(settings.MINIO_BUCKET, object_name)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track file not found")

    def read_range(start: int, length: int):
        obj = client.get_object(settings.MINIO_BUCKET, object_name, offset=start, length=length)
        try:
            remaining = length
            while remaining > 0:
                chunk = obj.read(min(_CHUNK_SIZE, remaining))
                if not chunk:
                    break
                chunk = chunk[:remaining]
                remaining -= len(chunk)
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    media_type = _content_type_for(object_name, getattr(stat, "content_type", None))
    return _ranged_response(request, int(stat.size), media_type, read_range)


def stream_local_response(request: Request, path: str) -> Response:
    """Serve a file from the server's music folders with HTTP Range support."""
    # file_url can be set through the admin API: never serve anything outside
    # the music folders (defence in depth against /etc/..., /proc/...).
    safe = safe_music_file(path)
    if safe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local file not found")
    path = safe

    def read_range(start: int, length: int):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(_CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return _ranged_response(request, os.path.getsize(path), _content_type_for(path), read_range)


def stream_track_file(request: Request, file_url: str) -> Response:
    """Stream a track's source file: a local file (``local:<path>``) or a MinIO object."""
    if file_url.startswith(LOCAL_PREFIX):
        return stream_local_response(request, file_url[len(LOCAL_PREFIX):])
    return stream_object_response(request, file_url)


_HLS_QUALITIES = frozenset({"128k", "192k", "320k"})
_SEGMENT_RE = re.compile(r"segment_\d{3,}\.ts")
_PLAYLIST_MEDIA_TYPE = "application/vnd.apple.mpegurl"


async def _get_hls_track(track_id: uuid.UUID, user: User, db: AsyncSession) -> Track:
    track = await get_track_for_user(track_id, user, db)
    if not track.hls_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HLS not available for this track")
    return track


def _check_quality(quality: str) -> None:
    if quality not in _HLS_QUALITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid quality. Use: {sorted(_HLS_QUALITIES)}",
        )


def _read_object(object_name: str, not_found_detail: str) -> bytes:
    client = get_minio_client()
    try:
        response = client.get_object(settings.MINIO_BUCKET, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)


def _pass_token_on(content: bytes, token: str | None) -> bytes:
    """Append the playlist's ``?token=`` to every URI it lists.

    Native HLS players (iOS, Android, Safari) fetch the variant playlists and
    segments themselves, without our Authorization header: the token the
    playlist was requested with has to travel with them.
    """
    if not token:
        return content
    param = "token=" + quote(token, safe="")
    lines = []
    for line in content.decode("utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            line = f"{line}{'&' if '?' in line else '?'}{param}"
        lines.append(line)
    return ("\n".join(lines) + "\n").encode("utf-8")


async def _playlist_response(object_name: str, not_found: str, request: Request) -> Response:
    # Off the event loop: the MinIO client is blocking.
    content = await asyncio.to_thread(_read_object, object_name, not_found)
    content = _pass_token_on(content, request.query_params.get("token"))
    return Response(content=content, media_type=_PLAYLIST_MEDIA_TYPE, headers={"Cache-Control": "private, no-cache"})


# HLS requests are authenticated like the direct stream (header or ``?token=``).
# HLS.js sends the Authorization header on every playlist/segment request;
# native players get the token passed on in the playlists instead.
@router.get("/{track_id}/master.m3u8")
async def get_master_playlist(
    track_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_stream),
):
    track = await _get_hls_track(track_id, current_user, db)
    return await _playlist_response(f"{track.hls_path}/master.m3u8", "Master playlist not found", request)


@router.get("/{track_id}/{quality}/playlist.m3u8")
async def get_variant_playlist(
    track_id: uuid.UUID,
    quality: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_stream),
):
    _check_quality(quality)
    track = await _get_hls_track(track_id, current_user, db)
    return await _playlist_response(f"{track.hls_path}/{quality}/playlist.m3u8", "Variant playlist not found", request)


@router.get("/{track_id}/{quality}/{segment}")
async def get_hls_segment(
    track_id: uuid.UUID,
    quality: str,
    segment: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_stream),
):
    _check_quality(quality)
    if not _SEGMENT_RE.fullmatch(segment):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid segment file")
    track = await _get_hls_track(track_id, current_user, db)
    content = await asyncio.to_thread(_read_object, f"{track.hls_path}/{quality}/{segment}", "Segment not found")
    # Segments never change once written (a re-transcode rewrites the playlists).
    return Response(content=content, media_type="video/mp2t", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/{track_id}/download")
async def download_track(
    track_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_stream),
):
    track = await get_track_for_user(track_id, current_user, db)
    if not track.file_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track file not available")

    file_ext = track.file_url.rsplit(".", 1)[-1] if "." in track.file_url else "mp3"
    filename = f"{track.artist.name if track.artist else 'Unknown'} - {track.title}.{file_ext}"

    response = stream_track_file(request, track.file_url)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
