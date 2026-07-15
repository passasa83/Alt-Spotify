"""add favorites table

Revision ID: 011
Revises: 010
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS favorites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            entity_id UUID NOT NULL,
            entity_type VARCHAR(20) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, entity_id, entity_type)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_favorites_user_entity
        ON favorites(user_id, entity_type)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_favorites_entity
        ON favorites(entity_type, entity_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS favorites")
