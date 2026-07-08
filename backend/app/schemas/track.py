import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TrackCreate(BaseModel):
    title: str
    album_id: uuid.UUID | None = None
    artist_id: uuid.UUID
    duration_seconds: int
    file_url: str | None = None
    hls_path: str | None = None
    genre: str | None = None
    lyrics_lrc: str | None = None
    track_gain: float | None = None
    track_peak: float | None = None
    album_gain: float | None = None


class TrackUpdate(BaseModel):
    title: str | None = None
    album_id: uuid.UUID | None = None
    duration_seconds: int | None = None
    file_url: str | None = None
    hls_path: str | None = None
    genre: str | None = None
    lyrics_lrc: str | None = None
    track_gain: float | None = None
    track_peak: float | None = None
    album_gain: float | None = None


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    album_id: uuid.UUID | None
    artist_id: uuid.UUID
    duration_seconds: int
    file_url: str | None
    hls_path: str | None
    genre: str | None
    lyrics_lrc: str | None
    track_gain: float | None
    track_peak: float | None
    album_gain: float | None
    play_count: int
    created_at: datetime
