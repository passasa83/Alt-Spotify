import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import PlaylistCard from '@/components/PlaylistCard';
import ImportPlaylistModal from '@/components/ImportPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { Link } from 'react-router-dom';
import { Plus, Upload, Play, Shuffle, Clock, Heart } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Track } from '@/types';

const Library = () => {
  const { t } = useTranslation();
  const { playlists, favorites, loadPlaylists, loadFavorites, isLoading } = useLibraryStore();
  const [activeTab, setActiveTab] = useState<'playlists' | 'favorites'>('playlists');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const { setTrack, currentTrack, isPlaying, queue, setQueue } = usePlayerStore();

  useEffect(() => {
    loadPlaylists();
    loadFavorites();
  }, [loadPlaylists, loadFavorites]);

  const handlePlayAll = () => {
    if (favorites.length > 0) {
      setTrack(favorites[0]);
    }
  };

  const handleShufflePlay = () => {
    if (favorites.length > 0) {
      const idx = Math.floor(Math.random() * favorites.length);
      setTrack(favorites[idx]);
    }
  };

  const totalDuration = favorites.reduce((acc, track) => acc + (track.duration_seconds || 0), 0);
  const hours = Math.floor(totalDuration / 3600);
  const minutes = Math.floor((totalDuration % 3600) / 60);

  return (
    <div className="pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Your Library</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            <Upload size={16} />
            {t('library.import_playlist')}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            <Plus size={16} />
            {t('library.create_playlist')}
          </button>
        </div>
      </div>

      <ImportPlaylistModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setActiveTab('playlists')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'playlists'
              ? 'bg-white text-black'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          {t('library.playlists')}
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'favorites'
              ? 'bg-white text-black'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          Liked Songs
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
        </div>
      ) : activeTab === 'playlists' ? (
        <div>
          {playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-xl font-bold text-white">Create your first playlist</p>
              <p className="mt-2 text-gray-400">It's easy, we'll help you</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 rounded-full bg-white px-6 py-3 font-bold text-black hover:scale-105"
              >
                {t('library.create_button')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-xl font-bold text-white">Songs you like will appear here</p>
              <p className="mt-2 text-gray-400">{t('library.save_songs')}</p>
              <Link
                to="/search"
                className="mt-4 rounded-full bg-white px-6 py-3 font-bold text-black hover:scale-105"
              >
                {t('library.find_songs')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
                <div className="flex h-48 w-48 items-center justify-center rounded-md bg-gradient-to-br from-purple-700 to-blue-300 shadow-2xl md:h-56 md:w-56">
                  <Heart size={64} className="text-white" fill="white" />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase text-white">Playlist</p>
                  <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">Liked Songs</h1>
                  <p className="mt-2 text-sm text-gray-400">
                    {favorites.length} {t('playlist.songs')}
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
              </div>

              <div className="mb-2 grid grid-cols-[16px_4fr_3fr_minmax(80px,1fr)_32px] gap-4 border-b border-gray-700 px-4 py-2 text-xs uppercase tracking-wider text-gray-400 md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]">
                <span className="text-right">#</span>
                <span>Title</span>
                <span className="hidden md:block">Album</span>
                <span className="hidden md:block">Date Added</span>
                <span className="flex justify-end">
                  <Clock size={16} />
                </span>
                <span />
              </div>

              <div className="space-y-0.5">
                {favorites.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className="group grid cursor-pointer items-center gap-4 rounded-md px-4 py-2 transition-colors hover:bg-gray-800 md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]"
                      onDoubleClick={() => setTrack(track)}
                    >
                      <div className="flex items-center justify-end">
                        <span className={`text-sm ${isCurrentTrack && isPlaying ? 'text-green-500' : 'text-gray-400 group-hover:hidden'}`}>
                          {isCurrentTrack && isPlaying ? '♪' : index + 1}
                        </span>
                        <button
                          onClick={() => setTrack(track)}
                          className="hidden text-white group-hover:block"
                        >
                          <Play size={14} fill="currentColor" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <img
                          src={track.cover_url || track.album?.cover_url || '/placeholder-album.png'}
                          alt={track.title}
                          className="h-10 w-10 rounded object-cover"
                        />
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${isCurrentTrack ? 'text-green-500' : 'text-white'}`}>{track.title}</p>
                          <p className="truncate text-xs text-gray-400">{track.artist?.name || t('player.unknown_artist')}</p>
                        </div>
                      </div>
                      <span className="hidden truncate text-sm text-gray-400 md:block">{track.album?.title || t('player.unknown_album')}</span>
                      <span className="hidden text-sm text-gray-400 md:block">Recently</span>
                      <span className="text-right text-sm text-gray-400">
                        {Math.floor((track.duration_seconds || 0) / 60)}:{((track.duration_seconds || 0) % 60).toString().padStart(2, '0')}
                      </span>
                      <div className="flex justify-end">
                        <div className="opacity-0 transition-all group-hover:opacity-100">
                          <TrackContextMenu
                            track={track}
                            menuDirection="left"
                            onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
    </div>
  );
};

export default Library;
