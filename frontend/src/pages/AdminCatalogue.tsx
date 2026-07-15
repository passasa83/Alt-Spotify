import { useEffect, useState, useCallback } from 'react';
import { getTracks } from '@/api/tracks';
import type { PaginatedResponse, Track } from '@/types';
import TrackList from '@/components/TrackList';
import { useTranslation } from '@/hooks/useTranslation';

const AdminCatalogue = () => {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchTracks = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data: PaginatedResponse<Track> = await getTracks(p, 20);
      setTracks(data.items);
      setTotalPages(data.pages);
    } catch (err) {
      console.error('Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks(page);
  }, [page, fetchTracks]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">{t('admin.catalogue')}</h1>
      </div>
      
      <div className="rounded-lg bg-gray-900 p-4">
        <TrackList tracks={tracks} onRefresh={() => fetchTracks(page)} />
      </div>
      
      <div className="flex items-center justify-center gap-4">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
        <button 
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default AdminCatalogue;
