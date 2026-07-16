import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Enum, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FollowType(str, enum.Enum):
    ARTIST = "ARTIST"
    USER = "USER"


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = {"schema": None}

    follower_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    followed_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    follow_type: Mapped[FollowType] = mapped_column(Enum(FollowType), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
