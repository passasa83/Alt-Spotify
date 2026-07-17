import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import PlaylistCard from '@/components/PlaylistCard';
import ImportPlaylistModal from '@/components/ImportPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import { Link } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const Library = () => {
  const { t } = useTranslation();
  const { playlists, favorites, loadPlaylists, loadFavorites, isLoading } = useLibraryStore();
  const [activeTab, setActiveTab] = useState<'playlists' | 'favorites'>('playlists');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadPlaylists();
    loadFavorites();
  }, [loadPlaylists, loadFavorites]);

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
            <div className="space-y-1">
              {favorites.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 rounded-md px-4 py-2 hover:bg-gray-800"
                >
                  <img
                    src={track.cover_url || track.album?.cover_url || '/placeholder-album.png'}
                    alt={track.title}
                    className="h-10 w-10 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/track/${track.id}`}
                      className="block truncate text-sm font-medium text-white hover:underline"
                    >
                      {track.title}
                    </Link>
                    <Link
                      to={`/artist/${track.artist_id}`}
                      className="block truncate text-xs text-gray-400 hover:underline"
                    >
                      {track.artist?.name || 'Unknown Artist'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Library;
