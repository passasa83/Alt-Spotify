import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PlaylistCreate(BaseModel):
    title: str
    description: str | None = None
    is_public: bool = True
    is_collaborative: bool = False


class PlaylistUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    is_public: bool | None = None
    is_collaborative: bool | None = None


class PlaylistTrackAdd(BaseModel):
    track_id: uuid.UUID
    position: int | None = None


class PlaylistTrackReorder(BaseModel):
    track_id: uuid.UUID
    new_position: int


class PlaylistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    owner_id: uuid.UUID
    description: str | None
    is_public: bool
    is_collaborative: bool
    created_at: datetime
    updated_at: datetime
