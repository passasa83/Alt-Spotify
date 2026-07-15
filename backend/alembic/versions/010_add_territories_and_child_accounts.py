"""add territories and child accounts

Revision ID: 010
Revises: 009
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("country", sa.String(2), nullable=True))
    op.add_column("users", sa.Column("is_child_account", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("tracks", sa.Column("allowed_territories", postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column("tracks", sa.Column("is_explicit", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("tracks", "is_explicit")
    op.drop_column("tracks", "allowed_territories")
    op.drop_column("users", "is_child_account")
    op.drop_column("users", "country")
