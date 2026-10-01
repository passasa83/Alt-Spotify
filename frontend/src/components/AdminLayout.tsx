import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Shield,
  HeartPulse,
  Users,
  Activity,
  Library,
  Upload,
  Mail,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import SkipToContent from './SkipToContent';

/**
 * Admin space, kept apart from the music app: its own navigation, no player,
 * admins only.
 */
const AdminLayout = () => {
  const { user, refreshAuth } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!user) {
      refreshAuth().catch(() => navigate('/login', { replace: true }));
    }
  }, [user, refreshAuth, navigate]);

  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const links = [
    { to: '/admin', label: t('admin.health'), icon: HeartPulse, end: true },
    { to: '/admin/users', label: t('admin.users'), icon: Users },
    { to: '/admin/dashboard', label: t('admin.dashboard'), icon: Activity },
    { to: '/admin/catalogue', label: t('admin.catalogue'), icon: Library },
    { to: '/admin/upload', label: t('nav.upload'), icon: Upload },
    { to: '/admin/invites', label: t('admin.invites'), icon: Mail },
    { to: '/admin/monitoring', label: t('admin.monitoring'), icon: Monitor },
    { to: '/admin/devices', label: t('admin.connected_devices'), icon: Smartphone },
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
    }`;

  return (
    <div className="flex h-screen flex-col bg-gray-950 md:flex-row">
      <SkipToContent />
      <aside className="flex-shrink-0 border-b border-gray-800 bg-black md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-2 text-white">
            <Shield size={22} className="text-amber-400" aria-hidden="true" />
            <span className="text-lg font-bold">{t('admin.overview')}</span>
          </div>
          <NavLink
            to="/"
            className="flex items-center gap-1 rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white md:hidden"
          >
            <ArrowLeft size={14} aria-hidden="true" /> {t('admin.back_to_app')}
          </NavLink>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0"
          aria-label={t('admin.overview')}
        >
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={(s) => `${linkClass(s)} flex-shrink-0`}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden p-2 md:block">
          <NavLink
            to="/"
            className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-white"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {t('admin.back_to_app')}
          </NavLink>
        </div>
      </aside>
      <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8" role="main">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
