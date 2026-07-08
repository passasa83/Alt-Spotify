import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Enum, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class JamSessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class JamSession(Base):
    __tablename__ = "jam_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    host_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    current_track_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tracks.id"), nullable=True)
    position_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[JamSessionStatus] = mapped_column(Enum(JamSessionStatus), default=JamSessionStatus.ACTIVE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    host: Mapped["User"] = relationship("User")
    participants: Mapped[list["JamParticipant"]] = relationship("JamParticipant", back_populates="session")


class JamParticipant(Base):
    __tablename__ = "jam_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jam_sessions.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    session: Mapped["JamSession"] = relationship("JamSession", back_populates="participants")
    user: Mapped["User"] = relationship("User")
