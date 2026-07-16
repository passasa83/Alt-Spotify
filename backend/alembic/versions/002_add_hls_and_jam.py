"""Add hls_path, jam sessions, follows

Revision ID: 002
Revises:
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add hls_path to tracks
    op.add_column("tracks", sa.Column("hls_path", sa.String(500), nullable=True))

    # Create jam_sessions table (IF NOT EXISTS for idempotency with 001)
    op.execute("""
        CREATE TABLE IF NOT EXISTS jam_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(8) UNIQUE NOT NULL,
            host_id UUID NOT NULL REFERENCES users(id),
            current_track_id UUID REFERENCES tracks(id),
            position_ms INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # Create jam_participants table (IF NOT EXISTS for idempotency with 001)
    op.execute("""
        CREATE TABLE IF NOT EXISTS jam_participants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES jam_sessions(id),
            user_id UUID NOT NULL REFERENCES users(id),
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    # Create follows table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS follows (
            follower_id UUID NOT NULL REFERENCES users(id),
            followed_id UUID NOT NULL,
            follow_type VARCHAR NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (follower_id, followed_id, follow_type)
        )
    """)


def downgrade() -> None:
    op.drop_table("jam_participants")
    op.drop_table("jam_sessions")
    op.drop_column("tracks", "hls_path")
    op.execute("DROP TABLE IF EXISTS follows")
    op.execute("DROP TYPE IF EXISTS jamsessionsstatus")
