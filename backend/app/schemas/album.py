import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AlbumCreate(BaseModel):
    title: str
    artist_id: uuid.UUID
    release_date: date | None = None
    cover_url: str | None = None


class AlbumUpdate(BaseModel):
    title: str | None = None
    release_date: date | None = None
    cover_url: str | None = None


class AlbumResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    artist_id: uuid.UUID
    release_date: date | None
    cover_url: str | None
    created_at: datetime
