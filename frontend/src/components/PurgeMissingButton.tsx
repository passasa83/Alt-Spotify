import { useCallback, useEffect, useState } from 'react';
import { FileX2 } from 'lucide-react';
import { purgeMissingTracks, type PurgeResult } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

/**
 * The tracks whose audio file is gone: counted first, then deleted in one
 * confirmation, with the albums and artists left empty behind them. Tracks
 * that still play through an HLS copy are only proposed when nothing
 * unplayable is left, with an explicit warning.
 */
const PurgeMissingButton = ({ onDone }: { onDone?: () => void }) => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [preview, setPreview] = useState<PurgeResult | null>(null);
  const [includeHls, setIncludeHls] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const unplayable = await purgeMissingTracks(true, true, true);
      if (unplayable.count > 0) {
        setPreview(unplayable);
        setIncludeHls(false);
        return;
      }
      const withHls = await purgeMissingTracks(true, true, true, true);
      setPreview(withHls.count > 0 ? withHls : null);
      setIncludeHls(withHls.count > 0);
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purge = async () => {
    setBusy(true);
    try {
      const done = await purgeMissingTracks(false, true, true, includeHls);
      addToast(t('admin.missing_delete_done', { count: done.deleted }));
      setConfirming(false);
      await refresh();
      onDone?.();
    } catch {
      addToast(t('admin.missing_delete_error'));
    } finally {
      setBusy(false);
    }
  };

  if (!preview?.count) return null;
  const albums = preview.orphan_albums ?? 0;
  const artists = preview.orphan_artists ?? 0;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex min-h-11 items-center gap-2 rounded-full bg-red-500/15 px-4 text-sm font-medium text-red-300 hover:bg-red-500/25"
        title={t(includeHls ? 'admin.missing_delete_hls_hint' : 'admin.missing_delete_hint')}
      >
        <FileX2 size={16} aria-hidden="true" />
        {t(includeHls ? 'admin.missing_delete_hls_button' : 'admin.missing_delete_button', { count: preview.count })}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="missing-delete-text" className="w-full rounded-lg bg-red-500/10 p-3 ring-1 ring-red-500/40">
      <p id="missing-delete-text" className="text-sm text-white">
        {t(includeHls ? 'admin.missing_delete_hls_confirm' : 'admin.missing_delete_confirm', { count: preview.count, albums, artists })}
      </p>
      <p className="mt-1 text-xs text-gray-400">{t('admin.purge_all_irreversible')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={purge}
          disabled={busy}
          className="min-h-11 rounded-full bg-red-500 px-5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {busy ? t('admin.purging') : t('admin.missing_delete_yes')}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="min-h-11 rounded-full px-5 text-sm text-gray-300 hover:text-white"
        >
          {t('bug.cancel')}
        </button>
      </div>
    </div>
  );
};

export default PurgeMissingButton;
