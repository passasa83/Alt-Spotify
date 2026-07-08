"""Add ReplayGain and offline columns to tracks

Revision ID: 005
Revises: 004
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("track_gain", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("track_peak", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("album_gain", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "album_gain")
    op.drop_column("tracks", "track_peak")
    op.drop_column("tracks", "track_gain")
