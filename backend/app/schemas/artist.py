import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArtistCreate(BaseModel):
    name: str
    bio: str | None = None
    image_url: str | None = None
    links: dict | None = None


class ArtistUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    image_url: str | None = None
    links: dict | None = None


class ArtistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    bio: str | None
    image_url: str | None
    links: dict | None
    created_at: datetime
