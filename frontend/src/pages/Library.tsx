import { useEffect, useState } from 'react';
import { useLibraryStore } from '@/stores/libraryStore';
import PlaylistCard from '@/components/PlaylistCard';
import ImportPlaylistModal from '@/components/ImportPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import { Plus, Upload } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const Library = () => {
  const { t } = useTranslation();
  const { playlists, loadPlaylists, isLoading } = useLibraryStore();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

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

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
        </div>
      ) : playlists.length === 0 ? (
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
          {[...playlists].sort((a, b) => {
            if (a.title === 'Liked Songs') return -1;
            if (b.title === 'Liked Songs') return 1;
            return 0;
          }).map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;
