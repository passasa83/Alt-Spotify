"""Add performance indexes for frequently queried columns."""

from alembic import op
import sqlalchemy as sa


revision = "007_add_performance_indexes"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tracks indexes
    op.create_index("ix_tracks_genre", "tracks", ["genre"])
    op.create_index("ix_tracks_artist_id", "tracks", ["artist_id"])
    op.create_index("ix_tracks_album_id", "tracks", ["album_id"])
    op.create_index("ix_tracks_play_count", "tracks", ["play_count"])
    op.create_index("ix_tracks_title_gin", "tracks", ["title"], postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"})

    # Listening history indexes
    op.create_index("ix_listening_history_user_id", "listening_history", ["user_id"])
    op.create_index("ix_listening_history_track_id", "listening_history", ["track_id"])
    op.create_index("ix_listening_history_played_at", "listening_history", ["played_at"])
    op.create_index("ix_listening_history_user_played", "listening_history", ["user_id", "played_at"])

    # Playlists indexes
    op.create_index("ix_playlists_owner_id", "playlists", ["owner_id"])
    op.create_index("ix_playlists_is_public", "playlists", ["is_public"])

    # Artists indexes
    op.create_index("ix_artists_name", "artists", ["name"])
    op.create_index("ix_artists_name_gin", "artists", ["name"], postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"})

    # Albums indexes
    op.create_index("ix_albums_title", "albums", ["title"])
    op.create_index("ix_albums_release_date", "albums", ["release_date"])
    op.create_index("ix_albums_artist_id", "albums", ["artist_id"])

    # Notifications indexes
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    # Follows indexes
    op.create_index("ix_follows_follower_id", "follows", ["follower_id"])
    op.create_index("ix_follows_followed_id", "follows", ["followed_id"])


def downgrade() -> None:
    op.drop_index("ix_follows_followed_id")
    op.drop_index("ix_follows_follower_id")
    op.drop_index("ix_notifications_created_at")
    op.drop_index("ix_notifications_is_read")
    op.drop_index("ix_notifications_user_id")
    op.drop_index("ix_albums_artist_id")
    op.drop_index("ix_albums_release_date")
    op.drop_index("ix_albums_title")
    op.drop_index("ix_artists_name_gin")
    op.drop_index("ix_artists_name")
    op.drop_index("ix_playlists_is_public")
    op.drop_index("ix_playlists_owner_id")
    op.drop_index("ix_listening_history_user_played")
    op.drop_index("ix_listening_history_played_at")
    op.drop_index("ix_listening_history_track_id")
    op.drop_index("ix_listening_history_user_id")
    op.drop_index("ix_tracks_title_gin")
    op.drop_index("ix_tracks_play_count")
    op.drop_index("ix_tracks_album_id")
    op.drop_index("ix_tracks_artist_id")
    op.drop_index("ix_tracks_genre")
