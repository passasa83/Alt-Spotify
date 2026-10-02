import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getTranscodeStatus, transcodeMissing, type TranscodeStatus } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';
import { formatDurationHm, formatRelative } from '@/utils/formatTime';

const POLL_MS = 5000;

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/** HLS coverage of the catalogue and live progress of the transcoding batch. */
const TranscodeProgress = () => {
  const { t, locale } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [status, setStatus] = useState<TranscodeStatus | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getTranscodeStatus());
    } catch {
      // Keep the last figures; the health checks already report a broken API.
    }
  }, []);

  const batch = status?.batch;
  const active = !!batch && batch.running + batch.queued > 0;
  // Batches started before this page existed are only visible through the queue.
  const busy = active || !!status?.queue_length;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [busy, load]);

  const start = async () => {
    setStarting(true);
    try {
      const { queued } = await transcodeMissing();
      addToast(t('admin.transcode_queued', { count: queued }));
      await load();
    } catch (err: any) {
      addToast(err?.response?.data?.detail || t('admin.transcode_error'));
    } finally {
      setStarting(false);
    }
  };

  if (!status || !status.with_source) return null;
  const missing = status.with_source - status.hls;
  const coverage = Math.round(pct(status.hls, status.with_source));

  return (
    <div className="mt-4 border-t border-gray-700/60 pt-4" aria-live="polite">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="text-gray-300">
          <span className="text-lg font-bold text-white">{status.hls}</span> / {status.with_source} {t('admin.catalogue_hls')}
        </span>
        <span className={coverage >= 90 ? 'text-green-400' : 'text-gray-300'}>{coverage} %</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={status.with_source}
        aria-valuenow={status.hls}
        aria-label={t('admin.catalogue_hls')}
      >
        <div className="h-full bg-green-500 transition-[width] duration-700" style={{ width: `${pct(status.hls, status.with_source)}%` }} />
      </div>

      {batch && (
        <div className="mt-4 rounded-md bg-gray-800/60 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-2 font-medium text-white">
              {active && <Loader2 size={14} className="animate-spin text-green-400" aria-hidden="true" />}
              {active ? t('admin.transcode_batch_running') : t('admin.transcode_batch_finished')}
            </span>
            <span className="text-xs text-gray-400">
              {t('admin.transcode_started', { time: formatRelative(new Date(batch.started_at * 1000).toISOString(), locale) })}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-700" aria-hidden="true">
            <div className="bg-green-500 transition-[width] duration-700" style={{ width: `${pct(batch.done, batch.total)}%` }} />
            <div className="bg-red-500" style={{ width: `${pct(batch.failed, batch.total)}%` }} />
            <div className="animate-pulse bg-blue-400" style={{ width: `${pct(batch.running, batch.total)}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
            <span><span className="text-green-400">■</span> {t('admin.transcode_done', { count: batch.done, total: batch.total })}</span>
            {batch.running > 0 && <span><span className="text-blue-300">■</span> {t('admin.transcode_running', { count: batch.running })}</span>}
            {batch.queued > 0 && <span><span className="text-gray-400">■</span> {t('admin.transcode_waiting', { count: batch.queued })}</span>}
            {batch.failed > 0 && <span><span className="text-red-400">■</span> {t('admin.transcode_failed', { count: batch.failed })}</span>}
          </p>
          {active && batch.eta_seconds != null && (
            <p className="mt-1 text-xs text-gray-300">{t('admin.transcode_eta', { time: formatDurationHm(Math.max(60, batch.eta_seconds)) })}</p>
          )}
          {batch.running_tracks.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-gray-400">
              {batch.running_tracks.slice(0, 3).map((track) => (
                <li key={track.id} className="truncate">
                  ▸ {track.title ?? track.id}{track.artist ? ` — ${track.artist}` : ''}
                </li>
              ))}
            </ul>
          )}
          {batch.failed_tracks.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-gray-400 hover:text-white">{t('admin.transcode_failed_list')}</summary>
              <ul className="mt-2 space-y-1.5">
                {batch.failed_tracks.map((track) => (
                  <li key={track.id}>
                    <span className="text-gray-200">{track.title ?? track.id}{track.artist ? ` — ${track.artist}` : ''}</span>
                    <span className="block break-all font-mono text-gray-500">{track.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!active && !!status.queue_length && (
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-300">
          <Loader2 size={12} className="animate-spin text-green-400" aria-hidden="true" />
          {t('admin.transcode_queue', { count: status.queue_length })}
        </p>
      )}

      {!busy && missing > 0 && (
        <button
          onClick={start}
          disabled={starting}
          className="mt-3 inline-block text-sm text-green-400 hover:underline disabled:opacity-50"
          title={t('admin.transcode_hint')}
        >
          {starting
            ? t('admin.transcoding')
            : batch?.failed
              ? t('admin.transcode_retry', { count: missing })
              : t('admin.transcode_button', { count: missing })}
        </button>
      )}
    </div>
  );
};

export default TranscodeProgress;
