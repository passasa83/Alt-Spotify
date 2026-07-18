import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserStats } from '@/api/users';
import { useTranslation } from '@/hooks/useTranslation';
import { usePlayerStore } from '@/stores/playerStore';
import { resolveCoverUrl } from '@/api/tracks';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { UserStats, Track } from '@/types';
import { Clock, Music, Flame, BarChart3 } from 'lucide-react';

const Stats = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { setTrack } = usePlayerStore();

  useEffect(() => {
    getUserStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{error || t('stats.no_stats')}</p>
      </div>
    );
  }

  const totalHours = Math.floor(stats.total_minutes / 60);
  const remainingMinutes = stats.total_minutes % 60;
  const maxPlays = Math.max(...(stats.top_tracks.map((t) => stats.total_plays) || [1]));
  const maxGenreCount = Math.max(...stats.genre_distribution.map((g) => g.count), 1);
  const maxHourCount = Math.max(...stats.listening_by_hour, 1);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">{t('stats.your_stats')}</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Clock size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('stats.listening_time')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            {totalHours}h {remainingMinutes}m
          </p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Music size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('stats.total_plays')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_plays.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Flame size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('stats.streak')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.streak} {t('stats.days')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('stats.top_tracks')}</h3>
          <div className="space-y-3">
            {stats.top_tracks.slice(0, 5).map((track, i) => (
              <div key={track.id} className="group flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 1}</span>
                <img
                  src={resolveCoverUrl(track.cover_url)}
                  alt={track.title}
                  className="h-10 w-10 rounded object-cover cursor-pointer"
                  onClick={() => setTrack(track as Track)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white cursor-pointer hover:underline" onClick={() => setTrack(track as Track)}>{track.title}</p>
                  <p className="truncate text-xs text-gray-400">
                    <Link to={`/artist/${(track as Track).artist_id}`} className="hover:underline">{track.artist?.name || t('player.unknown_artist')}</Link>
                  </p>
                </div>
                <div className="opacity-0 group-hover:opacity-100">
                  <TrackContextMenu
                    track={track as Track}
                    onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('stats.top_artists')}</h3>
          <div className="space-y-3">
            {stats.top_artists.slice(0, 5).map((artist, i) => (
              <div key={artist.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 1}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
                  {artist.image_url ? (
                    <img src={artist.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="text-sm text-white">{artist.name.charAt(0)}</span>
                  )}
                </div>
                <Link to={`/artist/${artist.id}`} className="text-sm font-medium text-white hover:underline">{artist.name}</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">{t('stats.genres')}</h3>
        <div className="space-y-2">
          {stats.genre_distribution.map((genre) => (
            <div key={genre.genre} className="flex items-center gap-3">
              <span className="w-24 text-sm text-gray-400">{genre.genre}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{ width: `${(genre.count / maxGenreCount) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-sm text-gray-500">{genre.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <BarChart3 size={20} /> {t('stats.listening_by_hour')}
        </h3>
        <div className="flex items-end gap-1 h-40">
          {stats.listening_by_hour.map((count, hour) => (
            <div key={hour} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-green-500"
                style={{ height: `${(count / maxHourCount) * 100}%`, minHeight: count > 0 ? '4px' : '0' }}
              />
              {hour % 6 === 0 && (
                <span className="text-[10px] text-gray-500">{hour}h</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/5 p-8 text-center">
        <h3 className="mb-2 text-2xl font-bold text-white">
          {t('stats.your_wrapped', { year: new Date().getFullYear() })}
        </h3>
        <p className="mb-4 text-gray-400">
          {t('stats.wrapped_desc', { hours: totalHours, genres: stats.genre_distribution.length })}
        </p>
        <div className="flex justify-center gap-8">
          <div>
            <p className="text-3xl font-bold text-green-400">
              {stats.top_artists[0] ? <Link to={`/artist/${stats.top_artists[0].id}`} className="text-3xl font-bold text-green-400 hover:underline">{stats.top_artists[0].name}</Link> : 'N/A'}
            </p>
            <p className="text-sm text-gray-400">{t('stats.top_artist')}</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-400">
              {stats.top_tracks[0]?.title || 'N/A'}
            </p>
            <p className="text-sm text-gray-400">{t('stats.top_track')}</p>
          </div>
        </div>
      </div>

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={() => setPlaylistModalTrack(null)}
        track={playlistModalTrack}
        onCreateNew={() => {
          setPlaylistModalTrack(null);
          setShowCreateModal(true);
        }}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
};

export default Stats;
