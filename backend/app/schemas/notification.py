import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.common import PaginatedResponse


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    message: str
    data: dict | None = None
    is_read: bool
    created_at: datetime


class NotificationList(PaginatedResponse[NotificationResponse]):
    unread_count: int
