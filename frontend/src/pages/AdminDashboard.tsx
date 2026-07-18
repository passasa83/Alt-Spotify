import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, getPlaysPerDay, getActiveUsers, getTopContent } from '@/api/admin';
import type { AdminDashboardData, PlaysPerDay, ActiveUsersPerDay, TopContent } from '@/api/admin';
import { Activity, Users, Music, HardDrive, Radio, BarChart3, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [playsData, setPlaysData] = useState<PlaysPerDay[]>([]);
  const [activeUsersData, setActiveUsersData] = useState<ActiveUsersPerDay[]>([]);
  const [topContent, setTopContent] = useState<TopContent | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, playsRes, activeRes, topRes] = await Promise.all([
        getAdminDashboard(),
        getPlaysPerDay(),
        getActiveUsers(),
        getTopContent(),
      ]);
      setDashboard(dashRes);
      setPlaysData(playsRes);
      setActiveUsersData(activeRes);
      setTopContent(topRes);
    } catch {
      console.error('Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !dashboard) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  const maxPlays = Math.max(...playsData.map((d) => d.plays), 1);
  const maxActive = Math.max(...activeUsersData.map((d) => d.active_users), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={32} className="text-green-500" />
          <h1 className="text-3xl font-bold text-white">{t('admin.dashboard')}</h1>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-green-500"
          aria-label={t('admin.refresh')}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('admin.refresh')}
        </button>
      </div>

      {dashboard && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Users size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">{t('admin.total_users')}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{dashboard.total_users}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Music size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">{t('admin.total_tracks')}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{dashboard.total_tracks}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <BarChart3 size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">{t('admin.plays_today')}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{dashboard.plays_today}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-6">
            <div className="mb-2 flex items-center gap-3">
              <HardDrive size={24} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-400">{t('admin.storage_used')}</h3>
            </div>
            <p className="text-3xl font-bold text-white">{dashboard.storage_used}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.plays_per_day')}</h3>
          <div className="flex items-end gap-1 h-48">
            {playsData.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-green-500"
                  style={{ height: `${(d.plays / maxPlays) * 100}%`, minHeight: d.plays > 0 ? '4px' : '0' }}
                />
                {i % 5 === 0 && (
                  <span className="text-[10px] text-gray-500">{d.date.slice(5)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.active_users_per_day')}</h3>
          <div className="flex items-end gap-1 h-48">
            {activeUsersData.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-blue-500"
                  style={{ height: `${(d.active_users / maxActive) * 100}%`, minHeight: d.active_users > 0 ? '4px' : '0' }}
                />
                {i % 5 === 0 && (
                  <span className="text-[10px] text-gray-500">{d.date.slice(5)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {topContent && (
        <div className="rounded-lg bg-gray-800 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">{t('admin.top_content')}</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-400">{t('stats.top_tracks')}</h4>
              <div className="space-y-2">
                {topContent.top_tracks.slice(0, 5).map((track, i) => (
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
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-400">{t('stats.top_artists')}</h4>
              <div className="space-y-2">
                {topContent.top_artists.slice(0, 5).map((artist, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-gray-500">{i + 1}</span>
                    <Link to={`/artist/${artist.id}`} className="min-w-0 flex-1 truncate text-white hover:underline">{artist.name}</Link>
                    <span className="text-gray-500">{artist.play_count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold text-gray-400">{t('admin.top_content')}</h4>
              <div className="space-y-2">
                {topContent.top_albums.slice(0, 5).map((album, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-gray-500">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-white">{album.title}</p>
                      <p className="truncate text-xs text-gray-400">{album.artist}</p>
                    </div>
                    <span className="text-gray-500">{album.play_count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
