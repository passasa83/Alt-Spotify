"""Add podcasts, episodes, and monitoring tables

Revision ID: 004
Revises: 003
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "podcasts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("feed_url", sa.String(500), nullable=True, index=True),
        sa.Column("categories", JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "episodes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("podcast_id", UUID(as_uuid=True), sa.ForeignKey("podcasts.id"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("audio_url", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("episode_number", sa.Integer(), nullable=True),
        sa.Column("season_number", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_played", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_episodes_podcast_id", "episodes", ["podcast_id"])


def downgrade() -> None:
    op.drop_table("episodes")
    op.drop_table("podcasts")
