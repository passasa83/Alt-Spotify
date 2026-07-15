"""add recommendations data

Revision ID: 008
Revises: 007
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_top_genres (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            genre VARCHAR(100) NOT NULL,
            score FLOAT DEFAULT 0.0,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, genre)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_top_genres_user_id
        ON user_top_genres(user_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_top_genres")
