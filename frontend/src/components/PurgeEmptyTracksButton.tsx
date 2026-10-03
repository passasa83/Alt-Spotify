import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { purgeUnplayableTracks, type PurgeResult } from '@/api/admin';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

/**
 * One button for every track without audio (search leftovers), including
 * those saved in playlists or likes, then the albums and artists left empty.
 * Counts first, asks for confirmation inline, then deletes.
 */
const PurgeEmptyTracksButton = ({ onDone }: { onDone?: () => void }) => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [preview, setPreview] = useState<PurgeResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPreview(await purgeUnplayableTracks(true, true, true));
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
      const done = await purgeUnplayableTracks(false, true, true);
      addToast(
        t('admin.purge_all_done', {
          count: done.deleted,
          albums: done.orphan_albums ?? 0,
          artists: done.orphan_artists ?? 0,
        }),
      );
      setConfirming(false);
      await refresh();
      onDone?.();
    } catch {
      addToast(t('admin.purge_error'));
    } finally {
      setBusy(false);
    }
  };

  if (!preview) return null;
  const albums = preview.orphan_albums ?? 0;
  const artists = preview.orphan_artists ?? 0;
  if (!preview.count && !albums && !artists) {
    return <p className="text-sm text-gray-400">{t('admin.purge_all_nothing')}</p>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex min-h-11 items-center gap-2 rounded-full bg-red-500/15 px-4 text-sm font-medium text-red-300 hover:bg-red-500/25"
        title={t('admin.purge_used_hint')}
      >
        <Trash2 size={16} aria-hidden="true" />
        {preview.count
          ? t('admin.purge_all_button', { count: preview.count })
          : t('admin.purge_orphans_button', { count: albums + artists })}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-labelledby="purge-confirm-text" className="w-full rounded-lg bg-red-500/10 p-3 ring-1 ring-red-500/40">
      <p id="purge-confirm-text" className="text-sm text-white">
        {t('admin.purge_all_confirm', { count: preview.count, albums, artists })}
      </p>
      <p className="mt-1 text-xs text-gray-400">{t('admin.purge_all_irreversible')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={purge}
          disabled={busy}
          className="min-h-11 rounded-full bg-red-500 px-5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {busy ? t('admin.purging') : t('admin.purge_all_yes')}
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

export default PurgeEmptyTracksButton;
