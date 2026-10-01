import { NavLink } from 'react-router-dom';
import { Home, Search, Library, Compass, HardDrive } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

// The sidebar is hidden below md: this bar replaces it on phones.
const MobileNav = () => {
  const { t } = useTranslation();
  const items = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/browse', label: t('browse.title'), icon: Compass },
    { to: '/search', label: t('nav.search'), icon: Search },
    { to: '/library', label: t('nav.playlists'), icon: Library },
    { to: '/local', label: t('local.title'), icon: HardDrive },
  ];

  return (
    <nav
      className="flex flex-shrink-0 justify-around border-t border-gray-800 bg-black pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main navigation"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive ? 'text-white' : 'text-gray-400'
            }`
          }
        >
          <Icon size={22} aria-hidden="true" />
          <span className="max-w-full truncate px-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileNav;
