import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import TrackList from '@/components/TrackList';
import type { Track } from '@/types';
import { getLocalTracks } from '@/api/tracks';
import { HardDrive, RefreshCw, Play, Shuffle } from 'lucide-react';

const LocalMusic = () => {
  const { t } = useTranslation();
  const { setTrack } = usePlayerStore();
  const { loadPlaylists } = useLibraryStore();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchTracks = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    try {
      const data = await getLocalTracks(pageNum, 50);
      if (append) {
        setTracks(prev => [...prev, ...data.items]);
      } else {
        setTracks(data.items);
      }
      setTotal(data.total);
      setHasMore(pageNum < data.pages);
    } catch (err) {
      console.error('Failed to load local tracks', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks(1);
  }, [fetchTracks]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setTrack(tracks[0]);
    }
  };

  const handleShuffleAll = () => {
    if (tracks.length > 0) {
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      setTrack(randomTrack);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTracks(nextPage, true);
  };

  return (
    <div className="pb-24">
      <div className="mb-8 flex items-end gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-green-600 to-green-800 shadow-lg">
          <HardDrive size={32} className="text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">{t('local.title')}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {total} {total === 1 ? t('local.track') : t('local.tracks')}
          </p>
        </div>
      </div>

      {loading && tracks.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <HardDrive size={48} className="mb-4 text-gray-500" />
          <p className="text-xl font-bold text-white">{t('local.empty')}</p>
          <p className="mt-2 text-gray-400">{t('local.empty_hint')}</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-3">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 font-bold text-black transition hover:scale-105 hover:bg-green-400"
            >
              <Play size={18} fill="currentColor" />
              {t('player.play')}
            </button>
            <button
              onClick={handleShuffleAll}
              className="flex items-center gap-2 rounded-full bg-gray-800 px-6 py-3 font-bold text-white transition hover:bg-gray-700"
            >
              <Shuffle size={18} />
              {t('player.shuffle')}
            </button>
          </div>

          <TrackList tracks={tracks} showAlbum={true} showIndex={true} onRefresh={() => fetchTracks(1)} />

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="flex items-center gap-2 rounded-full bg-gray-800 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {t('local.load_more')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LocalMusic;
