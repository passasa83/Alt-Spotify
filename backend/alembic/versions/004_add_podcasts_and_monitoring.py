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
    op.execute("""
        CREATE TABLE IF NOT EXISTS podcasts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(500),
            author VARCHAR(255),
            feed_url VARCHAR(500),
            categories JSON,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS episodes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            podcast_id UUID NOT NULL REFERENCES podcasts(id),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            audio_url VARCHAR(500),
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            episode_number INTEGER,
            season_number INTEGER,
            published_at TIMESTAMP WITH TIME ZONE,
            is_played BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_episodes_podcast_id ON episodes (podcast_id)")


def downgrade() -> None:
    op.drop_table("episodes")
    op.drop_table("podcasts")
