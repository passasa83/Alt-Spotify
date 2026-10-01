import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Users,
  Music,
  HardDrive,
  Server,
  Settings2,
  Activity,
  Upload,
  Mail,
  Library,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { getAdminOverview, type AdminOverview as Overview, type OverviewWarning } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n/en';
import { formatRelative } from '@/utils/formatTime';

const LEVEL_STYLE: Record<OverviewWarning['level'], { icon: typeof Info; className: string }> = {
  error: { icon: AlertCircle, className: 'border-red-500/40 bg-red-500/10 text-red-300' },
  warning: { icon: AlertTriangle, className: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200' },
  info: { icon: Info, className: 'border-blue-500/30 bg-blue-500/10 text-blue-200' },
};
const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };

const Card = ({ title, icon: Icon, children, action }: {
  title: string;
  icon: typeof Info;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <section className="rounded-lg bg-gray-800 p-5">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white">
        <Icon size={18} className="text-green-500" aria-hidden="true" />
        {title}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

const Stat = ({ value, label, tone = 'text-white' }: { value: number | string; label: string; tone?: string }) => (
  <div>
    <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    <p className="text-xs text-gray-400">{label}</p>
  </div>
);

const formatValue = (value: string | number | boolean) =>
  typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

const AdminOverview = () => {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getAdminOverview());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  const warnings = [...(data?.warnings ?? [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const catalogue = data?.catalogue;
  const playablePct = catalogue && catalogue.total > 0 ? Math.round((catalogue.playable / catalogue.total) * 100) : 0;

  const shortcuts = [
    { to: '/admin/users', label: t('admin.users'), icon: Users },
    { to: '/admin/dashboard', label: t('admin.dashboard'), icon: Activity },
    { to: '/admin/catalogue', label: t('admin.catalogue'), icon: Library },
    { to: '/admin/upload', label: t('nav.upload'), icon: Upload },
    { to: '/admin/invites', label: t('admin.invites'), icon: Mail },
    { to: '/admin/monitoring', label: t('admin.monitoring'), icon: Monitor },
    { to: '/admin/devices', label: t('admin.connected_devices'), icon: Smartphone },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield size={32} className="text-green-500" aria-hidden="true" />
          <div>
            <h1 className="text-3xl font-bold text-white">{t('admin.overview')}</h1>
            <p className="text-sm text-gray-400">
              {t('admin.overview_subtitle')}
              {data && ` · ${t('admin.updated_at', { time: formatRelative(data.generated_at, locale) })}`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-green-500"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {t('admin.refresh')}
        </button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={t('admin.shortcuts')}>
        {shortcuts.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-full bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {t('admin.load_error')}
        </p>
      )}

      {data && catalogue && (
        <>
          <Card title={t('admin.alerts')} icon={AlertTriangle}>
            {warnings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 size={16} aria-hidden="true" /> {t('admin.no_alerts')}
              </p>
            ) : (
              <ul className="space-y-2">
                {warnings.map((w, i) => {
                  const { icon: Icon, className } = LEVEL_STYLE[w.level];
                  return (
                    <li key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${className}`}>
                      <Icon size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <span>{t(`admin.warn.${w.code}` as TranslationKey, w.params)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title={t('admin.users_section')}
              icon={Users}
              action={
                <Link to="/admin/users" className="text-sm text-green-400 hover:underline">
                  {t('admin.manage_users')}
                </Link>
              }
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat value={data.users.total} label={t('admin.total_users')} />
                <Stat value={data.users.active} label={t('admin.users_active')} />
                <Stat value={data.users.admins} label={t('admin.users_admins')} />
                <Stat value={data.users.listeners_7d} label={t('admin.users_listeners_7d')} />
                <Stat value={data.users.new_7d} label={t('admin.users_new_7d')} />
                <Stat value={data.users.pending_invites} label={t('admin.users_pending_invites')} />
              </div>
            </Card>

            <Card title={t('admin.catalogue_section')} icon={Music}>
              <div className="mb-3 flex items-baseline justify-between">
                <p className="text-sm text-gray-300">
                  <span className="text-2xl font-bold text-white">{catalogue.playable}</span> / {catalogue.total}{' '}
                  {t('admin.catalogue_playable')}
                </p>
                <span className={`text-sm font-semibold ${playablePct >= 90 ? 'text-green-400' : playablePct >= 50 ? 'text-yellow-300' : 'text-red-400'}`}>
                  {playablePct} %
                </span>
              </div>
              {catalogue.total > 0 && (
                <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-gray-700" aria-hidden="true">
                  <div className="bg-green-500" style={{ width: `${(catalogue.playable / catalogue.total) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(catalogue.missing_files / catalogue.total) * 100}%` }} />
                  <div className="bg-gray-500" style={{ width: `${(catalogue.no_audio / catalogue.total) * 100}%` }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat value={catalogue.missing_files} label={t('admin.catalogue_missing')} tone={catalogue.missing_files ? 'text-red-400' : 'text-white'} />
                <Stat value={catalogue.no_audio} label={t('admin.catalogue_no_audio')} />
                <Stat value={catalogue.hls} label={t('admin.catalogue_hls')} />
                <Stat value={catalogue.local_files} label={t('admin.catalogue_local')} />
                <Stat value={catalogue.object_storage} label={t('admin.catalogue_stored')} />
              </div>
              {catalogue.missing_examples.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-gray-400 hover:text-white">
                    {t('admin.catalogue_missing_examples')}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {catalogue.missing_examples.map((path) => (
                      <li key={path} className="break-all font-mono text-xs text-gray-400">{path}</li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>

            <Card title={t('admin.music_dirs')} icon={HardDrive}>
              <ul className="space-y-3">
                {data.music_dirs.map((dir) => (
                  <li key={dir.setting} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-400">{dir.setting}</p>
                      <p className="break-all text-white">{dir.path}</p>
                    </div>
                    {dir.exists ? (
                      <div className="flex-shrink-0 text-right">
                        <p className={dir.audio_files > 0 ? 'text-green-400' : 'text-yellow-300'}>
                          {t('admin.dir_files', { count: `${dir.audio_files}${dir.capped ? '+' : ''}` })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {dir.writable ? t('admin.dir_writable') : t('admin.dir_read_only')}
                        </p>
                      </div>
                    ) : (
                      <span className="flex-shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                        {t('admin.dir_missing')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={t('admin.services')} icon={Server}>
              <ul className="grid grid-cols-2 gap-3">
                {Object.entries(data.services).map(([name, status]) => (
                  <li key={name} className="rounded-md bg-gray-900 px-3 py-2" title={status.detail ?? undefined}>
                    <p className="text-sm capitalize text-white">{name}</p>
                    <p className={`flex items-center gap-1 text-xs ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`h-2 w-2 rounded-full ${status.ok ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
                      {status.ok ? t('admin.service_ok') : t('admin.service_down')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title={t('admin.config')} icon={Settings2}>
            <p className="mb-3 text-xs text-gray-500">{t('admin.config_hint')}</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {data.config.map(({ key, value }) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-gray-700/60 pb-1.5">
                  <dt className="font-mono text-xs text-gray-400">{key}</dt>
                  <dd className="truncate text-right text-white" title={formatValue(value)}>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminOverview;
