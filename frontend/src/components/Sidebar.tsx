import { NavLink } from 'react-router-dom';
import { Home, Search, Library, Plus, Heart, Radio, BarChart3, Upload, Headphones, Activity, Sparkles } from 'lucide-react';
import { useLibraryStore } from '@/stores/libraryStore';
import { useAuthStore } from '@/stores/authStore';
import { useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

const Sidebar = () => {
  const { playlists, loadPlaylists } = useLibraryStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-4 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
    }`;

  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col bg-black p-2 md:flex lg:w-72" role="navigation" aria-label={t('nav.library')}>
      <div className="mb-2 rounded-lg bg-gray-900 p-4">
        <NavLink to="/" className="mb-4 flex items-center gap-2 text-white" aria-label="Alt Spotify Home">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
            <span className="text-sm font-bold text-black">S</span>
          </div>
          <span className="text-xl font-bold">Alt Spotify</span>
        </NavLink>
        <nav className="space-y-1" aria-label="Main navigation">
          <NavLink to="/" className={navLinkClass} aria-label={t('nav.home')}>
            <Home size={24} aria-hidden="true" />
            {t('nav.home')}
          </NavLink>
          <NavLink to="/search" className={navLinkClass} aria-label={t('nav.search')}>
            <Search size={24} aria-hidden="true" />
            {t('nav.search')}
          </NavLink>
          <NavLink to="/library" className={navLinkClass} aria-label={t('nav.library')}>
            <Library size={24} aria-hidden="true" />
            {t('nav.library')}
          </NavLink>
          <NavLink to="/jam" className={navLinkClass} aria-label={t('nav.jam')}>
            <Radio size={24} aria-hidden="true" />
            {t('nav.jam')}
          </NavLink>
          <NavLink to="/stats" className={navLinkClass} aria-label={t('nav.stats')}>
            <BarChart3 size={24} aria-hidden="true" />
            {t('nav.stats')}
          </NavLink>
          <NavLink to="/discover" className={navLinkClass} aria-label="Discover">
            <Sparkles size={24} aria-hidden="true" />
            Discover
          </NavLink>
          <NavLink to="/podcasts" className={navLinkClass} aria-label={t('nav.podcasts')}>
            <Headphones size={24} aria-hidden="true" />
            {t('nav.podcasts')}
          </NavLink>
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin/upload" className={navLinkClass} aria-label={t('nav.upload')}>
              <Upload size={24} aria-hidden="true" />
              {t('nav.upload')}
            </NavLink>
          )}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin/dashboard" className={navLinkClass} aria-label={t('admin.dashboard')}>
              <Activity size={24} aria-hidden="true" />
              {t('admin.dashboard')}
            </NavLink>
          )}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg bg-gray-900 p-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-sm font-semibold text-gray-400">{t('nav.playlists')}</span>
          <button className="rounded-full p-1 text-gray-400 hover:text-white" aria-label={t('library.create_playlist')}>
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-2 rounded-md p-2 hover:bg-gray-800">
          <NavLink
            to="/library"
            className="flex items-center gap-3 text-sm text-gray-400 hover:text-white"
            aria-label={t('nav.liked_songs')}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-gradient-to-br from-purple-700 to-blue-300">
              <Heart size={12} className="text-white" aria-hidden="true" />
            </div>
            {t('nav.liked_songs')}
          </NavLink>
        </div>

        <div className="space-y-1" role="list" aria-label="Your playlists">
          {playlists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) =>
                `block truncate rounded-md px-2 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
                }`
              }
              aria-current={({ isActive }: { isActive: boolean }) => isActive ? 'page' : undefined}
            >
              {playlist.name}
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
