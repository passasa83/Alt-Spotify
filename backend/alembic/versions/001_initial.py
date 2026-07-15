"""initial schema

Revision ID: 001
Revises: None
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            pseudo VARCHAR(100) UNIQUE NOT NULL,
            avatar_url VARCHAR(500),
            bio TEXT,
            country VARCHAR(2),
            is_child_account BOOLEAN DEFAULT FALSE NOT NULL,
            role VARCHAR(20) DEFAULT 'USER' NOT NULL,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS artists (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            bio TEXT,
            image_url VARCHAR(500),
            links JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS albums (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            release_date DATE,
            cover_url VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
            artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            duration_seconds INTEGER NOT NULL,
            file_url VARCHAR(500),
            hls_path VARCHAR(500),
            genre VARCHAR(100),
            lyrics_lrc TEXT,
            track_gain FLOAT,
            track_peak FLOAT,
            album_gain FLOAT,
            allowed_territories VARCHAR[],
            is_explicit BOOLEAN DEFAULT FALSE NOT NULL,
            play_count INTEGER DEFAULT 0 NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS playlists (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            is_public BOOLEAN DEFAULT FALSE NOT NULL,
            is_collaborative BOOLEAN DEFAULT FALSE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER DEFAULT 0 NOT NULL,
            added_by UUID REFERENCES users(id),
            added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (playlist_id, track_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS listening_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            duration_listened_seconds INTEGER DEFAULT 0 NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_listening_history_user ON listening_history(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listening_history_track ON listening_history(track_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at)")

    op.execute("""
        CREATE TYPE follow_type AS ENUM ('USER', 'ARTIST')
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS follows (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            followed_id UUID NOT NULL,
            follow_type follow_type NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(follower_id, followed_id, follow_type)
        )
    """)

    op.execute("""
        CREATE TYPE jam_session_status AS ENUM ('active', 'ended')
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS jam_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(10) UNIQUE NOT NULL,
            host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            current_track_id UUID REFERENCES tracks(id),
            position_ms INTEGER DEFAULT 0,
            status jam_session_status DEFAULT 'active' NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_jam_sessions_code ON jam_sessions(code)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS jam_participants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES jam_sessions(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) DEFAULT 'guest',
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(session_id, user_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS podcasts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(500),
            author VARCHAR(255),
            feed_url VARCHAR(500) UNIQUE,
            categories VARCHAR[],
            episode_count INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS episodes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            audio_url VARCHAR(500),
            duration_seconds INTEGER DEFAULT 0,
            episode_number INTEGER,
            season_number INTEGER,
            published_at TIMESTAMP WITH TIME ZONE,
            is_played BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_episodes_podcast ON episodes(podcast_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            data JSONB,
            is_read BOOLEAN DEFAULT FALSE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(500) NOT NULL,
            platform VARCHAR(20) NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS push_tokens")
    op.execute("DROP TABLE IF EXISTS notifications")
    op.execute("DROP TABLE IF EXISTS episodes")
    op.execute("DROP TABLE IF EXISTS podcasts")
    op.execute("DROP TABLE IF EXISTS jam_participants")
    op.execute("DROP TABLE IF EXISTS jam_sessions")
    op.execute("DROP TYPE IF EXISTS jam_session_status")
    op.execute("DROP TABLE IF EXISTS follows")
    op.execute("DROP TYPE IF EXISTS follow_type")
    op.execute("DROP TABLE IF EXISTS listening_history")
    op.execute("DROP TABLE IF EXISTS playlist_tracks")
    op.execute("DROP TABLE IF EXISTS playlists")
    op.execute("DROP TABLE IF EXISTS tracks")
    op.execute("DROP TABLE IF EXISTS albums")
    op.execute("DROP TABLE IF EXISTS artists")
    op.execute("DROP TABLE IF EXISTS users")
