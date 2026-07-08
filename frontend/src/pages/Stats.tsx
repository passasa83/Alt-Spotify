import { useEffect, useState } from 'react';
import { getUserStats } from '@/api/users';
import type { UserStats } from '@/types';
import { Clock, Music, Flame, BarChart3 } from 'lucide-react';

const Stats = () => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <p className="text-gray-500">{error || 'No stats available'}</p>
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
      <h1 className="text-3xl font-bold text-white">Your Stats</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Clock size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">Total Listening Time</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            {totalHours}h {remainingMinutes}m
          </p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Music size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">Total Plays</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_plays.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Flame size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">Listening Streak</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.streak} days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Top Tracks</h3>
          <div className="space-y-3">
            {stats.top_tracks.slice(0, 5).map((track, i) => (
              <div key={track.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 1}</span>
                <img
                  src={track.cover_url || '/placeholder-album.png'}
                  alt={track.title}
                  className="h-10 w-10 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="truncate text-xs text-gray-400">
                    {track.artist?.name || 'Unknown'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">Top Artists</h3>
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
                <p className="text-sm font-medium text-white">{artist.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Genre Distribution</h3>
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
          <BarChart3 size={20} /> Listening by Hour
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
          Your {new Date().getFullYear()} Wrapped
        </h3>
        <p className="mb-4 text-gray-400">
          You listened for {totalHours} hours across {stats.genre_distribution.length} genres
        </p>
        <div className="flex justify-center gap-8">
          <div>
            <p className="text-3xl font-bold text-green-400">
              {stats.top_artists[0]?.name || 'N/A'}
            </p>
            <p className="text-sm text-gray-400">Top Artist</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-400">
              {stats.top_tracks[0]?.title || 'N/A'}
            </p>
            <p className="text-sm text-gray-400">Top Track</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stats;
