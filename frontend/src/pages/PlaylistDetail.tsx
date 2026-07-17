import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPlaylist, getPlaylistTracks } from '@/api/playlists';
import { usePlayerStore } from '@/stores/playerStore';
import TrackList from '@/components/TrackList';
import { Play, Shuffle, MoreHorizontal, Clock } from 'lucide-react';
import type { Playlist, PlaylistTrack } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const PlaylistDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setTrack } = usePlayerStore();

  useEffect(() => {
    const loadPlaylist = async () => {
      if (!id) return;
      try {
        const [playlistData, tracksData] = await Promise.all([
          getPlaylist(parseInt(id)),
          getPlaylistTracks(parseInt(id)),
        ]);
        setPlaylist(playlistData);
        setTracks(tracksData);
      } catch {
        console.error('Failed to load playlist');
      } finally {
        setIsLoading(false);
      }
    };
    loadPlaylist();
  }, [id]);

  const handlePlayAll = () => {
    if (tracks.length > 0 && tracks[0]?.track) {
      setTrack(tracks[0].track);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const track = tracks[randomIndex]?.track;
      if (track) setTrack(track);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">{t('playlist.not_found')}</p>
      </div>
    );
  }

  const totalDuration = tracks.reduce((acc, pt) => acc + (pt.track?.duration || 0), 0);
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
        {playlist.cover_url ? (
          <img
            src={playlist.cover_url}
            alt={playlist.name}
            className="h-48 w-48 rounded-md object-cover shadow-2xl md:h-56 md:w-56"
          />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-md bg-gradient-to-br from-purple-700 to-blue-300 shadow-2xl md:h-56 md:w-56">
            <span className="text-6xl">♫</span>
          </div>
        )}
        <div>
          <p className="text-sm font-medium uppercase text-white">{t('playlist.playlist')}</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">{playlist.name}</h1>
          {playlist.description && (
            <p className="mt-2 text-sm text-gray-400">{playlist.description}</p>
          )}
          <p className="mt-2 text-sm text-gray-400">
            {playlist.owner?.pseudo || 'Unknown'} • {tracks.length} {t('playlist.songs')}
            {hours > 0 && `, ${hours} hr`}
            {minutes > 0 && ` ${minutes} min`}
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handlePlayAll}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button
          onClick={handleShufflePlay}
          className="text-gray-400 transition-colors hover:text-white"
        >
          <Shuffle size={24} />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <MoreHorizontal size={24} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-[16px_4fr_3fr_minmax(120px,1fr)] gap-4 border-b border-gray-700 px-4 py-2 text-xs uppercase tracking-wider text-gray-400 md:grid-cols-[16px_4fr_2fr_3fr_minmax(120px,1fr)]">
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden md:block">Album</span>
        <span className="hidden md:block">Date Added</span>
        <span className="flex justify-end">
          <Clock size={16} />
        </span>
      </div>

      <div className="space-y-0.5">
        {tracks.map((pt, index) => (
          pt.track && (
            <div
              key={pt.id}
              className="group grid cursor-pointer items-center gap-4 rounded-md px-4 py-2 transition-colors hover:bg-gray-800 md:grid-cols-[16px_4fr_2fr_3fr_minmax(120px,1fr)]"
              onDoubleClick={() => pt.track && setTrack(pt.track)}
            >
              <div className="flex items-center justify-end">
                <span className="text-sm text-gray-400 group-hover:hidden">{index + 1}</span>
                <button
                  onClick={() => pt.track && setTrack(pt.track)}
                  className="hidden text-white group-hover:block"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <img
                  src={pt.track.cover_url || pt.track.album?.cover_url || '/placeholder-album.svg'}
                  alt={pt.track.title}
                  className="h-10 w-10 rounded object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{pt.track.title}</p>
                  <p className="truncate text-xs text-gray-400">{pt.track.artist?.name || 'Unknown Artist'}</p>
                </div>
              </div>
              <span className="hidden truncate text-sm text-gray-400 md:block">{pt.track.album?.title || 'Unknown Album'}</span>
              <span className="hidden text-sm text-gray-400 md:block">{pt.added_at ? new Date(pt.added_at).toLocaleDateString() : 'Recently'}</span>
              <span className="text-right text-sm text-gray-400">
                {Math.floor(pt.track.duration / 60)}:{(pt.track.duration % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export default PlaylistDetail;
