"""add jam sync fields and participant permissions

Revision ID: 013
Revises: 012
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("jam_sessions", sa.Column("is_paused", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("jam_sessions", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("jam_participants", sa.Column("role", sa.String(20), server_default="MEMBER", nullable=False))
    op.add_column("jam_participants", sa.Column("device_id", sa.String(128), nullable=True))

def downgrade() -> None:
    op.drop_column("jam_participants", "device_id")
    op.drop_column("jam_participants", "role")
    op.drop_column("jam_sessions", "last_synced_at")
    op.drop_column("jam_sessions", "is_paused")