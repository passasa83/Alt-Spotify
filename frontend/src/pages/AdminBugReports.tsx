import { useCallback, useEffect, useState } from 'react';
import { Bug, RefreshCw } from 'lucide-react';
import {
  getBugReports,
  updateBugReport,
  type BugReport,
  type BugReportPage,
  type BugStatus,
} from '@/api/bugReports';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n/en';
import { useToastStore } from '@/stores/toastStore';
import { formatRelative } from '@/utils/formatTime';

const STATUSES: BugStatus[] = ['new', 'in_progress', 'resolved', 'wont_fix'];
const STATUS_STYLE: Record<BugStatus, string> = {
  new: 'bg-red-500/15 text-red-300',
  in_progress: 'bg-yellow-500/15 text-yellow-200',
  resolved: 'bg-green-500/15 text-green-300',
  wont_fix: 'bg-gray-500/20 text-gray-300',
};

const ReportCard = ({ report, onChange }: { report: BugReport; onChange: (r: BugReport, statusChanged: boolean) => void }) => {
  const { t, locale } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [note, setNote] = useState(report.admin_note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (body: { status?: BugStatus; admin_note?: string }) => {
    setSaving(true);
    try {
      onChange(await updateBugReport(report.id, body), body.status !== undefined);
    } catch {
      addToast(t('admin.bugs.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const ctx = report.context;
  const errors: { at: string; message: string }[] = ctx?.errors ?? [];

  return (
    <li className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[report.status]}`}>
          {t(`admin.bugs.status.${report.status}` as TranslationKey)}
        </span>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-gray-300">
          {t(`bug.category.${report.category}` as TranslationKey)}
        </span>
        <span className="text-gray-400">
          {report.reporter?.pseudo ?? t('admin.bugs.deleted_user')} · {formatRelative(report.created_at, locale)}
        </span>
        {report.page_url && <span className="break-all font-mono text-gray-500">{report.page_url}</span>}
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-white">{report.description}</p>

      {ctx && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer py-1 text-gray-400 hover:text-white">
            {t('admin.bugs.details')}
            {errors.length > 0 && <span className="ml-2 text-red-300">{t('admin.bugs.error_count', { count: errors.length })}</span>}
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-gray-300">
            {ctx.track && (
              <>
                <dt className="text-gray-500">{t('admin.bugs.track')}</dt>
                <dd className="break-words">
                  {ctx.track.title} — {ctx.track.artist ?? '?'} ({ctx.track.is_playing ? '▶' : '⏸'} {ctx.track.position}s, {ctx.track.hls ? 'HLS' : t('admin.bugs.direct')})
                </dd>
              </>
            )}
            <dt className="text-gray-500">{t('admin.bugs.screen')}</dt>
            <dd>{ctx.screen} · {ctx.language} · {ctx.online ? 'online' : 'offline'} · v{ctx.app_version}</dd>
            {report.user_agent && (
              <>
                <dt className="text-gray-500">{t('admin.bugs.browser')}</dt>
                <dd className="break-words">{report.user_agent}</dd>
              </>
            )}
          </dl>
          {errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-gray-400">
              {errors.map((e, i) => (
                <li key={i} className="break-all">
                  <span className="text-gray-600">{e.at.slice(11, 19)}</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="sr-only" htmlFor={`status-${report.id}`}>{t('admin.bugs.status_label')}</label>
        <select
          id={`status-${report.id}`}
          value={report.status}
          disabled={saving}
          onChange={(e) => save({ status: e.target.value as BugStatus })}
          className="min-h-11 rounded-md bg-gray-800 px-3 text-sm text-white"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`admin.bugs.status.${s}` as TranslationKey)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`note-${report.id}`}>{t('admin.bugs.note')}</label>
        <textarea
          id={`note-${report.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (report.admin_note ?? '') && save({ admin_note: note })}
          rows={1}
          placeholder={t('admin.bugs.note')}
          className="min-h-11 flex-1 resize-y rounded-md bg-gray-800 p-2.5 text-sm text-white placeholder-gray-500"
        />
      </div>
    </li>
  );
};

const AdminBugReports = () => {
  const { t } = useTranslation();
  // Open reports first: that's what needs attention.
  const [filter, setFilter] = useState<BugStatus | 'all'>('new');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BugReportPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getBugReports(filter === 'all' ? undefined : filter, page));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (updated: BugReport, statusChanged: boolean) => {
    // A new status moves the report to another tab and changes the counters.
    if (statusChanged) {
      void load();
      return;
    }
    setData((d) => d && { ...d, items: d.items.map((r) => (r.id === updated.id ? updated : r)) });
  };

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const tabs: { key: BugStatus | 'all'; count: number }[] = [
    ...STATUSES.map((s) => ({ key: s, count: data?.counts[s] ?? 0 })),
    { key: 'all', count: total },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bug size={28} className="text-green-500" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">{t('admin.bugs.title')}</h1>
            <p className="text-sm text-gray-400">{t('admin.bugs.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex min-h-11 items-center gap-2 rounded-md bg-gray-800 px-4 text-sm text-gray-300 hover:bg-gray-700"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {t('admin.refresh')}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map(({ key, count }) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            className={`flex min-h-11 flex-shrink-0 items-center gap-2 rounded-full px-4 text-sm ${
              filter === key ? 'bg-white font-semibold text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {key === 'all' ? t('admin.bugs.all') : t(`admin.bugs.status.${key}` as TranslationKey)}
            <span className={`rounded-full px-1.5 text-xs ${filter === key ? 'bg-black/10' : 'bg-gray-700'}`}>{count}</span>
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{t('admin.load_error')}</p>}

      {data && data.items.length === 0 && !loading && (
        <p className="rounded-lg bg-gray-900 p-8 text-center text-sm text-gray-400">{t('admin.bugs.empty')}</p>
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((report) => (
            <ReportCard key={report.id} report={report} onChange={replace} />
          ))}
        </ul>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-gray-300">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-11 px-3 disabled:opacity-40">←</button>
          <span>{page} / {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="min-h-11 px-3 disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
};

export default AdminBugReports;
