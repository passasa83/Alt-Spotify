import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.minio import get_minio_client
from app.core.config import settings
from app.models.track import Track

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{track_id}/master.m3u8")
async def get_master_playlist(track_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not track.hls_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HLS not available for this track")

    client = get_minio_client()
    master_key = f"{track.hls_path}/master.m3u8"
    try:
        response = client.get_object(settings.MINIO_BUCKET, master_key)
        content = response.read()
        response.close()
        response.release_conn()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master playlist not found")

    return Response(content=content, media_type="application/vnd.apple.mpegurl")


@router.get("/{track_id}/{quality}/playlist.m3u8")
async def get_variant_playlist(track_id: uuid.UUID, quality: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not track.hls_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HLS not available for this track")

    valid_qualities = {"128k", "192k", "320k"}
    if quality not in valid_qualities:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid quality. Use: {valid_qualities}")

    client = get_minio_client()
    playlist_key = f"{track.hls_path}/{quality}/playlist.m3u8"
    try:
        response = client.get_object(settings.MINIO_BUCKET, playlist_key)
        content = response.read()
        response.close()
        response.release_conn()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant playlist not found")

    return Response(content=content, media_type="application/vnd.apple.mpegurl")


@router.get("/{track_id}/{quality}/{segment}")
async def get_hls_segment(track_id: uuid.UUID, quality: str, segment: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == track_id))
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
    if not track.hls_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HLS not available for this track")

    valid_qualities = {"128k", "192k", "320k"}
    if quality not in valid_qualities:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid quality. Use: {valid_qualities}")
    if not segment.endswith(".ts"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid segment file")

    client = get_minio_client()
    segment_key = f"{track.hls_path}/{quality}/{segment}"
    try:
        response = client.get_object(settings.MINIO_BUCKET, segment_key)
        content = response.read()
        response.close()
        response.release_conn()
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")

    return Response(content=content, media_type="video/mp2t")
