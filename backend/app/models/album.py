import uuid
from datetime import datetime, date, timezone

from sqlalchemy import String, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    artist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("artists.id"), nullable=False)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    artist: Mapped["Artist"] = relationship("Artist", back_populates="albums")
    tracks: Mapped[list["Track"]] = relationship("Track", back_populates="album", lazy="selectin")
