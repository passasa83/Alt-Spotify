import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, ForeignKey, Text, Float, ARRAY, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    album_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("albums.id"), nullable=True)
    artist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("artists.id"), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hls_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    genre: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    lyrics_lrc: Mapped[str | None] = mapped_column(Text, nullable=True)
    track_gain: Mapped[float | None] = mapped_column(Float, nullable=True)
    track_peak: Mapped[float | None] = mapped_column(Float, nullable=True)
    album_gain: Mapped[float | None] = mapped_column(Float, nullable=True)
    allowed_territories: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    is_explicit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    play_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    album: Mapped["Album | None"] = relationship("Album", back_populates="tracks")
    artist: Mapped["Artist"] = relationship("Artist", back_populates="tracks")
    listening_history: Mapped[list["ListeningHistory"]] = relationship("ListeningHistory", back_populates="track")
