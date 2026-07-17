import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Bell, ChevronDown, Settings, LogOut, Globe } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import NotificationBell from './NotificationBell';
import { useTranslation } from '@/hooks/useTranslation';
import type { Locale } from '@/i18n';

const TopBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const { t, locale, setLocale } = useTranslation();
  const isSearchPage = location.pathname === '/search';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-gray-900/80 px-6 py-3 backdrop-blur-md">
      {!isSearchPage && (
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
          <input
            type="text"
            placeholder={t('search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('nav.search')}
            className="w-64 rounded-full bg-gray-800 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-400 outline-none focus:outline-2 focus:outline-green-500 lg:w-96"
          />
        </form>
      )}
      {isSearchPage && <div />}

      <div className="flex items-center gap-4">
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            aria-label={t('settings.language')}
            aria-expanded={isLangOpen}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            <Globe size={16} />
            <span className="hidden sm:inline">{locale.toUpperCase()}</span>
          </button>
          {isLangOpen && (
            <div className="absolute right-0 top-full mt-2 w-32 rounded-md bg-gray-800 py-1 shadow-xl z-50">
              {(['en', 'fr'] as Locale[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setLocale(lang);
                    setIsLangOpen(false);
                  }}
                  className={`flex w-full items-center px-4 py-2 text-sm ${
                    locale === lang ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {lang === 'en' ? 'English' : 'Français'}
                </button>
              ))}
            </div>
          )}
        </div>

        <NotificationBell />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 rounded-full bg-gray-800 py-1 pl-1 pr-3 hover:bg-gray-700"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-600">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="text-sm font-medium">
                  {user?.pseudo?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <span className="text-sm font-medium hidden sm:inline">{user?.pseudo || 'User'}</span>
            <ChevronDown size={16} className="text-gray-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-md bg-gray-800 py-1 shadow-xl">
              <button
                onClick={() => {
                  navigate('/settings');
                  setIsDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                <Settings size={16} />
                {t('user.settings')}
              </button>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                <LogOut size={16} />
                {t('auth.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
