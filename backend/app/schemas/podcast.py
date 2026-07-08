import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EpisodeCreate(BaseModel):
    podcast_id: uuid.UUID
    title: str
    description: str | None = None
    audio_url: str | None = None
    duration_seconds: int = 0
    episode_number: int | None = None
    season_number: int | None = None
    published_at: datetime | None = None


class EpisodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    podcast_id: uuid.UUID
    title: str
    description: str | None
    audio_url: str | None
    duration_seconds: int
    episode_number: int | None
    season_number: int | None
    published_at: datetime | None
    is_played: bool
    created_at: datetime


class PodcastCreate(BaseModel):
    title: str
    description: str | None = None
    image_url: str | None = None
    author: str | None = None
    feed_url: str | None = None
    categories: list[str] | None = None


class PodcastUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    image_url: str | None = None
    author: str | None = None
    feed_url: str | None = None
    categories: list[str] | None = None


class PodcastResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    image_url: str | None
    author: str | None
    feed_url: str | None
    categories: list[str] | None
    episode_count: int = 0
    created_at: datetime


class PodcastWithEpisodesResponse(PodcastResponse):
    episodes: list[EpisodeResponse] = []


class RSSImportRequest(BaseModel):
    feed_url: str
