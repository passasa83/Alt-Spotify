import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '@/api/client';
import { useTranslation } from '@/hooks/useTranslation';
import { Clock, TrendingUp, Music, Play } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { Track } from '@/types';

type Tab = 'new' | 'trending' | 'genres';

const GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'Jazz', 'Classical', 'Electronic', 'R&B', 'Country',
  'Metal', 'Folk', 'Reggae', 'Punk', 'Blues', 'Latin', 'K-Pop', 'Indie',
];

const Browse = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('new');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const { setTrack } = usePlayerStore();
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const fetchTracks = async () => {
      setLoading(true);
      try {
        if (tab === 'new') {
          const res = await client.get('/tracks', { params: { sort: 'created_at', order: 'desc', page_size: 50 } });
          setTracks(res.data.items || res.data);
        } else if (tab === 'trending') {
          const res = await client.get('/tracks', { params: { sort: 'play_count', order: 'desc', page_size: 50 } });
          setTracks(res.data.items || res.data);
        } else if (tab === 'genres' && selectedGenre) {
          const res = await client.get('/tracks', { params: { genre: selectedGenre, page_size: 50 } });
          setTracks(res.data.items || res.data);
        }
      } catch {
        console.error('Failed to fetch tracks');
      } finally {
        setLoading(false);
      }
    };
    fetchTracks();
  }, [tab, selectedGenre]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'new', label: t('browse.new_releases'), icon: <Clock size={18} /> },
    { key: 'trending', label: t('browse.trending'), icon: <TrendingUp size={18} /> },
    { key: 'genres', label: t('browse.genres'), icon: <Music size={18} /> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">{t('browse.title')}</h1>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedGenre(null); }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'genres' && (
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selectedGenre === genre ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Music size={48} className="mb-4" />
          <p>{tab === 'genres' && !selectedGenre ? t('browse.select_genre') : t('common.no_results')}</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {tracks.map((track, i) => (
            <div
              key={track.id}
              className="group flex items-center gap-4 rounded-md px-4 py-2 hover:bg-gray-800"
            >
              <span className="w-8 text-right text-sm text-gray-500 group-hover:hidden">{i + 1}</span>
              <button
                onClick={() => setTrack(track)}
                className="hidden h-8 w-8 items-center justify-center rounded-full bg-green-500 text-black group-hover:flex"
                aria-label={t('player.play')}
              >
                <Play size={14} fill="black" />
              </button>
              <div className="flex-1 min-w-0">
                <Link to={`/track/${track.id}`} className="truncate text-white hover:underline">
                  {track.title}
                </Link>
                <p className="truncate text-sm text-gray-400">
                  {track.artist?.name || t('player.unknown_artist')}
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {Math.floor(track.duration_seconds / 60)}:{String(track.duration_seconds % 60).padStart(2, '0')}
              </span>
              <div className="opacity-0 group-hover:opacity-100">
                <TrackContextMenu
                  track={track}
                  onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={() => setPlaylistModalTrack(null)}
        track={playlistModalTrack}
        onCreateNew={() => {
          setPlaylistModalTrack(null);
          setShowCreateModal(true);
        }}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
};

export default Browse;
