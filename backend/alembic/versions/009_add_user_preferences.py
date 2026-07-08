"""add user preferences

Revision ID: 009
Revises: 008
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            language VARCHAR(10) DEFAULT 'en',
            theme VARCHAR(20) DEFAULT 'dark',
            notifications_enabled BOOLEAN DEFAULT TRUE,
            email_notifications BOOLEAN DEFAULT TRUE,
            lastfm_username VARCHAR(100),
            lastfm_scrobble BOOLEAN DEFAULT FALSE,
            offline_mode BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
        ON user_preferences(user_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_preferences")
