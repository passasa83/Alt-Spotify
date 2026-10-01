import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { usePlayerStore } from '@/stores/playerStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { Track } from '@/types';
import { formatTime, formatDate } from '@/utils/formatTime';
import { Clock, Filter, Calendar, Play } from 'lucide-react';
import client from '@/api/client';
import { resolveCoverUrl } from '@/api/tracks';
import { usePlaylistModals } from '@/hooks/usePlaylistModals';

interface HistoryItem {
  id: string;
  track_id: string;
  title: string;
  artist_id: string;
  cover_url?: string;
  duration_seconds: number;
  played_at: string;
  duration_listened_seconds: number;
  artist?: { id: string; name: string; image_url?: string };
}

const History = () => {
  const { t } = useTranslation();
  const { setTrack, currentTrack, isPlaying } = usePlayerStore();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [genre, setGenre] = useState('');
  const { playlistModalTrack, showCreateModal, openAddToPlaylist, openCreatePlaylist, closeAddToPlaylist, closeCreatePlaylist } = usePlaylistModals();

  const fetchHistory = async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: '50' });
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (genre) params.set('genre', genre);

      const resp = await client.get(`/playlists/user/history?${params}`);
      const data = resp.data;
      setItems(data.items || []);
      setTotalPages(data.pages || 1);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(page);
  }, [page, fromDate, toDate, genre]);

  const formatHistoryDate = (iso: string) => {
    return formatDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const itemToTrack = (item: HistoryItem): Track => ({
    id: item.track_id,
    title: item.title,
    artist_id: item.artist_id,
    cover_url: item.cover_url,
    duration_seconds: item.duration_seconds,
    is_explicit: false,
    play_count: 0,
    created_at: '',
    artist: item.artist,
  } as Track);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">{t('history.title')}</h1>

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-800 p-4">
        <Calendar size={16} className="text-gray-400" />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white"
          placeholder={t('history.from')}
        />
        <span className="text-gray-500">→</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white"
          placeholder={t('history.to')}
        />
        <Filter size={16} className="text-gray-400 ml-2" />
        <input
          type="text"
          value={genre}
          onChange={(e) => { setGenre(e.target.value); setPage(1); }}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white"
          placeholder={t('history.genre_filter')}
        />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-gray-500">{t('history.empty')}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => {
            const isCurrentTrack = currentTrack?.id === item.track_id;
            return (
              <div
                key={item.id}
                className={`group flex items-center gap-4 rounded-lg px-4 py-3 transition-colors ${
                  isCurrentTrack && isPlaying
                    ? 'bg-green-500/10 text-green-400'
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                <div className="relative h-10 w-10">
                  <img
                    src={resolveCoverUrl(item.cover_url)}
                    alt={item.title}
                    className="h-10 w-10 rounded object-cover"
                  />
                  <button
                    onClick={() => setTrack(itemToTrack(item))}
                    className={`absolute inset-0 flex items-center justify-center rounded bg-black/50 transition-opacity ${
                      isCurrentTrack && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Play size={16} fill="white" className="text-white" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${isCurrentTrack ? 'text-green-500' : ''}`}>{item.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {item.artist?.name ? <Link to={`/artist/${item.artist.id}`} className="hover:underline">{item.artist.name}</Link> : ''}
                    {item.duration_listened_seconds > 0
                      ? ` • ${formatTime(item.duration_listened_seconds)} / ${formatTime(item.duration_seconds)}`
                      : ` • ${formatTime(item.duration_seconds)}`}
                  </p>
                </div>
                <span className="text-xs text-gray-500">{formatHistoryDate(item.played_at)}</span>
                <div className="opacity-0 group-hover:opacity-100">
                  <TrackContextMenu
                    track={itemToTrack(item)}
                    onAddToPlaylist={(t) => openAddToPlaylist(t)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded bg-gray-700 px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={closeAddToPlaylist}
        track={playlistModalTrack}
        onCreateNew={openCreatePlaylist}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={closeCreatePlaylist}
      />
    </div>
  );
};

export default History;
