"""Add hls_path, jam sessions, follows

Revision ID: 002
Revises:
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "002"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add hls_path to tracks
    op.add_column("tracks", sa.Column("hls_path", sa.String(500), nullable=True))

    # Create jam_sessions table
    op.create_table(
        "jam_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(8), unique=True, index=True, nullable=False),
        sa.Column("host_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("current_track_id", UUID(as_uuid=True), sa.ForeignKey("tracks.id"), nullable=True),
        sa.Column("position_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "ENDED", name="jamsessionsstatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Create jam_participants table
    op.create_table(
        "jam_participants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("jam_sessions.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

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
