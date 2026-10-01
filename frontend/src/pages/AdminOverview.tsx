import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle2,
  HeartPulse,
  Music,
  Database,
  Search,
  HardDrive,
  Users,
  Lock,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import {
  getAdminOverview,
  type AdminOverview as Overview,
  type AdminAreaName,
  type AdminCheck,
  type CheckStatus,
} from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n/en';
import { formatRelative } from '@/utils/formatTime';

const STATUS: Record<CheckStatus, { icon: typeof Info; text: string; badge: string; ring: string }> = {
  ok: { icon: CheckCircle2, text: 'text-green-400', badge: 'bg-green-500/15 text-green-300', ring: 'ring-gray-800' },
  info: { icon: Info, text: 'text-blue-300', badge: 'bg-blue-500/15 text-blue-200', ring: 'ring-gray-800' },
  warning: { icon: AlertTriangle, text: 'text-yellow-300', badge: 'bg-yellow-500/15 text-yellow-200', ring: 'ring-yellow-500/40' },
  error: { icon: XCircle, text: 'text-red-400', badge: 'bg-red-500/15 text-red-300', ring: 'ring-red-500/50' },
};
const RANK: Record<CheckStatus, number> = { error: 0, warning: 1, info: 2, ok: 3 };

const AREA_ICON: Record<AdminAreaName, typeof Info> = {
  playback: Music,
  storage: HardDrive,
  search: Search,
  database: Database,
  accounts: Users,
  security: Lock,
};

const StatusBadge = ({ status }: { status: CheckStatus }) => {
  const { t } = useTranslation();
  const { icon: Icon, badge } = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
      <Icon size={12} aria-hidden="true" />
      {t(`admin.status.${status}` as TranslationKey)}
    </span>
  );
};

const CheckRow = ({ check }: { check: AdminCheck }) => {
  const { t } = useTranslation();
  const { icon: Icon, text } = STATUS[check.status];
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${text}`} aria-label={t(`admin.status.${check.status}` as TranslationKey)} />
      <span className={check.status === 'ok' ? 'text-gray-300' : 'text-white'}>
        {t(`admin.check.${check.code}` as TranslationKey, check.params)}
      </span>
    </li>
  );
};

const Stat = ({ value, label, tone = 'text-white' }: { value: number | string; label: string; tone?: string }) => (
  <div>
    <p className={`text-xl font-bold ${tone}`}>{value}</p>
    <p className="text-xs text-gray-400">{label}</p>
  </div>
);

const AdminOverview = () => {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

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

  const errors = data?.checks.filter((c) => c.status === 'error').length ?? 0;
  const warnings = data?.checks.filter((c) => c.status === 'warning').length ?? 0;
  // Broken areas first, so what doesn't work is at the top.
  const areas = [...(data?.areas ?? [])].sort((a, b) => RANK[a.status] - RANK[b.status]);

  // Extra figures shown inside some areas.
  const areaExtras = (area: AdminAreaName): ReactNode => {
    if (!data) return null;
    const c = data.catalogue;
    if (area === 'playback' && c.total > 0) {
      const pct = Math.round((c.playable / c.total) * 100);
      return (
        <div className="mt-4 border-t border-gray-700/60 pt-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-gray-300">
              <span className="text-lg font-bold text-white">{c.playable}</span> / {c.total} {t('admin.catalogue_playable')}
            </span>
            <span className={pct >= 90 ? 'text-green-400' : pct >= 50 ? 'text-yellow-300' : 'text-red-400'}>{pct} %</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-700" aria-hidden="true">
            <div className="bg-green-500" style={{ width: `${(c.playable / c.total) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(c.missing_files / c.total) * 100}%` }} />
            <div className="bg-gray-500" style={{ width: `${(c.no_audio / c.total) * 100}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-gray-400">
            <span><span className="text-green-400">■</span> {t('admin.catalogue_playable')}</span>
            <span><span className="text-red-400">■</span> {c.missing_files} {t('admin.catalogue_missing')}</span>
            <span><span className="text-gray-400">■</span> {c.no_audio} {t('admin.catalogue_no_audio')}</span>
          </p>
          {!!c.purgeable && (
            <Link to="/admin/catalogue" className="mt-3 inline-block text-sm text-green-400 hover:underline">
              {t('admin.purge_button', { count: c.purgeable })} →
            </Link>
          )}
          {c.missing_examples.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-gray-400 hover:text-white">{t('admin.catalogue_missing_examples')}</summary>
              <ul className="mt-2 space-y-1">
                {c.missing_examples.map((path) => (
                  <li key={path} className="break-all font-mono text-gray-400">{path}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      );
    }
    if (area === 'accounts') {
      const u = data.users;
      return (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-700/60 pt-4">
          <Stat value={u.total} label={t('admin.total_users')} />
          <Stat value={u.listeners_7d} label={t('admin.users_listeners_7d')} />
          <Stat value={u.pending_invites} label={t('admin.users_pending_invites')} />
          <div className="col-span-3">
            <Link to="/admin/users" className="text-sm text-green-400 hover:underline">{t('admin.manage_users')} →</Link>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <HeartPulse size={30} className="text-green-500" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">{t('admin.health')}</h1>
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

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{t('admin.load_error')}</p>
      )}

      {data && (
        <>
          {/* Status strip: one chip per area, jump to its panel */}
          <div
            className={`rounded-lg p-4 ring-1 ${errors ? 'bg-red-500/10 ring-red-500/40' : warnings ? 'bg-yellow-500/10 ring-yellow-500/30' : 'bg-green-500/10 ring-green-500/30'}`}
          >
            <p className={`mb-3 font-semibold ${errors ? 'text-red-300' : warnings ? 'text-yellow-200' : 'text-green-300'}`}>
              {errors || warnings ? t('admin.health_summary', { errors, warnings }) : t('admin.health_summary_ok')}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.areas.map(({ area, status }) => {
                const Icon = AREA_ICON[area];
                const { text } = STATUS[status];
                return (
                  <a
                    key={area}
                    href={`#area-${area}`}
                    className="flex items-center gap-2 rounded-full bg-gray-900/70 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    <Icon size={14} className={text} aria-hidden="true" />
                    {t(`admin.area.${area}` as TranslationKey)}
                    <span className={`h-2 w-2 rounded-full ${status === 'ok' ? 'bg-green-500' : status === 'info' ? 'bg-blue-400' : status === 'warning' ? 'bg-yellow-400' : 'bg-red-500'}`} />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {areas.map(({ area, status }) => {
              const Icon = AREA_ICON[area];
              const checks = data.checks
                .filter((c) => c.area === area)
                .sort((a, b) => RANK[a.status] - RANK[b.status]);
              return (
                <section
                  key={area}
                  id={`area-${area}`}
                  className={`scroll-mt-4 rounded-lg bg-gray-900 p-5 ring-1 ${STATUS[status].ring}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                      <Icon size={18} className={STATUS[status].text} aria-hidden="true" />
                      {t(`admin.area.${area}` as TranslationKey)}
                    </h2>
                    <StatusBadge status={status} />
                  </div>
                  <p className="mb-4 text-xs text-gray-500">{t(`admin.area.${area}_desc` as TranslationKey)}</p>
                  <ul className="space-y-2">
                    {checks.map((check) => (
                      <CheckRow key={`${check.code}-${JSON.stringify(check.params)}`} check={check} />
                    ))}
                  </ul>
                  {areaExtras(area)}
                </section>
              );
            })}
          </div>

          <section className="rounded-lg bg-gray-900 ring-1 ring-gray-800">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex w-full items-center justify-between gap-2 p-5 text-left"
              aria-expanded={showConfig}
            >
              <span className="flex items-center gap-2 text-base font-semibold text-white">
                <Settings2 size={18} className="text-gray-400" aria-hidden="true" />
                {t('admin.config')}
              </span>
              <ChevronDown size={18} className={`text-gray-400 transition-transform ${showConfig ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showConfig && (
              <div className="px-5 pb-5">
                <p className="mb-3 text-xs text-gray-500">{t('admin.config_hint')}</p>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {data.config.map(({ key, value }) => (
                    <div key={key} className="flex items-baseline justify-between gap-3 border-b border-gray-700/60 pb-1.5">
                      <dt className="font-mono text-xs text-gray-400">{key}</dt>
                      <dd className="truncate text-right text-white" title={String(value)}>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AdminOverview;
