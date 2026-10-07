import { useEffect, useState, useCallback } from 'react';
import { Merge } from 'lucide-react';
import { getTracks } from '@/api/tracks';
import { mergeDuplicates } from '@/api/admin';
import PurgeEmptyTracksButton from '@/components/PurgeEmptyTracksButton';
import RecheckCoversButton from '@/components/RecheckCoversButton';
import FillGenresButton from '@/components/FillGenresButton';
import FillAlbumsButton from '@/components/FillAlbumsButton';
import type { PaginatedResponse, Track } from '@/types';
import TrackList from '@/components/TrackList';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/stores/toastStore';

type AudioFilter = 'all' | 'playable' | 'unplayable';

const FILTER_PARAM: Record<AudioFilter, boolean | undefined> = {
  all: undefined,
  playable: true,
  unplayable: false,
};

const AdminCatalogue = () => {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AudioFilter>('all');
  const [mergeable, setMergeable] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  // Remounts the purge button so it counts again after a merge.
  const [purgeKey, setPurgeKey] = useState(0);

  const fetchTracks = useCallback(async (p: number, f: AudioFilter) => {
    setLoading(true);
    try {
      const data: PaginatedResponse<Track> = await getTracks(p, 20, { playable: FILTER_PARAM[f] });
      setTracks(data.items);
      setTotalPages(Math.max(1, data.pages));
      setTotal(data.total);
    } catch {
      console.error('Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks(page, filter);
  }, [page, filter, fetchTracks]);

  const refreshMergeable = useCallback(async () => {
    try {
      setMergeable((await mergeDuplicates(true)).count);
    } catch {
      setMergeable(null);
    }
  }, []);

  useEffect(() => {
    refreshMergeable();
  }, [refreshMergeable]);

  const handleMerge = async () => {
    if (!mergeable || !confirm(t('admin.merge_confirm', { count: mergeable }))) return;
    setMerging(true);
    try {
      const { merged } = await mergeDuplicates(false);
      addToast(t('admin.merge_done', { count: merged }));
      await Promise.all([fetchTracks(page, filter), refreshMergeable()]);
      setPurgeKey((k) => k + 1);
    } catch {
      addToast(t('admin.merge_error'));
    } finally {
      setMerging(false);
    }
  };

  const filters: { value: AudioFilter; label: string }[] = [
    { value: 'all', label: t('admin.filter_all') },
    { value: 'playable', label: t('admin.filter_playable') },
    { value: 'unplayable', label: t('admin.filter_unplayable') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{t('admin.catalogue')}</h1>
          <p className="text-sm text-gray-400">{t('admin.catalogue_count', { count: total })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button
          onClick={handleMerge}
          disabled={!mergeable || merging}
          className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-40"
          title={t('admin.merge_hint')}
        >
          <Merge size={16} aria-hidden="true" />
          {merging ? t('admin.merging') : t('admin.merge_button', { count: mergeable ?? 0 })}
        </button>
        <RecheckCoversButton />
        <FillGenresButton />
        <FillAlbumsButton />
        <PurgeEmptyTracksButton key={purgeKey} onDone={() => fetchTracks(page, filter)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('admin.catalogue')}>
        {filters.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === value ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-lg bg-gray-900 p-4">
          <TrackList tracks={tracks} onRefresh={() => fetchTracks(page, filter)} />
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {t('action.back')}
        </button>
        <span className="text-sm text-gray-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {t('player.next')}
        </button>
      </div>
    </div>
  );
};

export default AdminCatalogue;
