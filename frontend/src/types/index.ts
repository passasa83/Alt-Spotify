export interface User {
  id: string;
  email: string;
  pseudo: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  is_child_account: boolean;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

export interface Artist {
  id: string;
  name: string;
  image_url?: string;
  bio?: string;
  links?: Record<string, string>;
  created_at: string;
}

export interface Album {
  id: string;
  title: string;
  artist_id: string;
  artist?: Artist;
  cover_url?: string;
  release_date?: string;
  created_at: string;
}

export interface Track {
  id: string;
  title: string;
  artist_id: string;
  album_id?: string;
  artist?: Artist;
  album?: Album;
  duration_seconds: number;
  file_url?: string;
  hls_path?: string;
  cover_url?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  mood?: string;
  lyrics_lrc?: string;
  allowed_territories?: string[];
  is_explicit: boolean;
  track_gain?: number;
  track_peak?: number;
  play_count: number;
  created_at: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  owner_id: string;
  owner?: User;
  is_public: boolean;
  is_collaborative: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaylistTrack {
  playlist_id: string;
  track_id: string;
  track?: Track;
  position: number;
  added_by?: string;
  added_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export interface SearchFilters {
  genre?: string;
  year?: number;
  min_duration?: number;
  max_duration?: number;
  min_bpm?: number;
  max_bpm?: number;
  key?: string;
  mood?: string;
  lyrics?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ListeningHistory {
  id: string;
  user_id: string;
  track_id: string;
  track?: Track;
  played_at: string;
  duration_listened_seconds: number;
}

export interface UserStats {
  total_plays: number;
  total_listening_seconds: number;
  top_artists: Artist[];
  top_tracks: Track[];
  monthly: {
    total_plays: number;
    total_seconds: number;
    unique_tracks: number;
  };
  genre_distribution: { genre: string; count: number }[];
  listening_by_hour: number[];
  streak: number;
}

export interface JamParticipant {
  user_id: string;
  username: string;
  avatar_url?: string;
  role: 'host' | 'guest';
  joined_at: string;
}

export interface JamSession {
  id: string;
  code: string;
  host_id: string;
  status: 'active' | 'ended';
  current_track_id?: string;
  position_ms: number;
  queue: Track[];
  participants: JamParticipant[];
  created_at: string;
}

export interface JamMessage {
  type: 'track_changed' | 'queue_updated' | 'vote_skip' | 'participant_joined' | 'participant_left' | 'chat';
  data: any;
  user_id?: string;
}

export interface LyricsLine {
  time_seconds: number;
  text: string;
}

export interface ShareLink {
  url: string;
  expires_at?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface Podcast {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  author?: string;
  feed_url?: string;
  categories?: string[];
  episode_count: number;
  created_at: string;
}

export interface Episode {
  id: string;
  podcast_id: string;
  title: string;
  description?: string;
  audio_url?: string;
  duration_seconds: number;
  episode_number?: number;
  season_number?: number;
  published_at?: string;
  is_played: boolean;
  created_at: string;
}

export interface MonitoringHealth {
  status: string;
  timestamp: number;
  uptime_seconds: number;
  services: Record<string, { status: string; error?: string; type?: string }>;
}

export interface MonitoringStats {
  active_users: number;
  total_tracks: number;
  total_podcasts: number;
  total_episodes: number;
  disk_usage: {
    total_bytes: number;
    free_bytes: number;
    used_bytes: number;
    usage_percent: number;
  };
  uptime_seconds: number;
}
