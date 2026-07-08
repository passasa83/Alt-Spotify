import { useEffect, useState } from 'react';
import { getCatalogueStats } from '@/api/admin';
import type { CatalogueStats } from '@/api/admin';
import { Music, Disc3, Users, HardDrive } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const AdminCatalogue = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<CatalogueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCatalogueStats()
      .then(setStats)
      .catch(() => console.error('Failed to load catalogue stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{t('common.error')}</p>
      </div>
    );
  }

  const maxGenreCount = Math.max(...stats.tracks_by_genre.map((g) => g.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Music size={32} className="text-green-500" />
        <h1 className="text-3xl font-bold text-white">{t('admin.catalogue')}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Music size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('admin.total_tracks')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_tracks}</p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Disc3 size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('admin.total_albums')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_albums}</p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <Users size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('admin.total_artists')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_artists}</p>
        </div>
        <div className="rounded-lg bg-gray-800 p-6">
          <div className="mb-2 flex items-center gap-3">
            <HardDrive size={24} className="text-green-500" />
            <h3 className="text-sm font-semibold text-gray-400">{t('admin.storage_used')}</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.storage_used}</p>
        </div>
      </div>

      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.tracks_by_genre')}</h3>
        <div className="space-y-2">
          {stats.tracks_by_genre.map((genre) => (
            <div key={genre.genre} className="flex items-center gap-3">
              <span className="w-32 text-sm text-gray-400">{genre.genre}</span>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.most_played')}</h3>
          <div className="space-y-2">
            {stats.most_played.slice(0, 10).map((track, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-gray-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white">{track.title}</p>
                  <p className="truncate text-xs text-gray-400">{track.artist}</p>
                </div>
                <span className="text-gray-500">{track.play_count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.storage_per_artist')}</h3>
          <div className="space-y-2">
            {stats.storage_per_artist.slice(0, 10).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate text-white">{item.artist}</span>
                <span className="ml-4 text-gray-400">{item.storage}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCatalogue;
