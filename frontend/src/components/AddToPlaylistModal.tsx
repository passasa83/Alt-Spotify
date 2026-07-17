import { useEffect } from 'react';
import { X, Music, Plus, Heart } from 'lucide-react';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import { addTrackToPlaylist } from '@/api/playlists';
import { addFavorite } from '@/api/favorites';
import type { Track } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  onCreateNew: () => void;
}

const AddToPlaylistModal = ({ isOpen, onClose, track, onCreateNew }: Props) => {
  const { playlists, loadPlaylists } = useLibraryStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen) loadPlaylists();
  }, [isOpen, loadPlaylists]);

  if (!isOpen || !track) return null;

  const handleAdd = async (playlistId: string, title: string) => {
    try {
      if (title === 'Liked Songs') {
        await addFavorite('track', String(track.id));
      } else {
        await addTrackToPlaylist(playlistId, String(track.id));
      }
      addToast(`Added to ${title}`);
      onClose();
    } catch (err) {
      console.error('Failed to add track to playlist', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg bg-gray-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Add to playlist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <p className="mb-3 text-sm text-gray-400 truncate">
          Adding: <span className="text-white">{track.title}</span>
        </p>

        <button
          onClick={() => {
            onClose();
            onCreateNew();
          }}
          className="mb-2 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-700">
            <Plus size={16} />
          </div>
          New playlist
        </button>

        <div className="max-h-60 overflow-y-auto">
          {playlists.map((playlist) => {
            const isLiked = playlist.title === 'Liked Songs';
            return (
              <button
                key={playlist.id}
                onClick={() => handleAdd(playlist.id, playlist.title)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded ${isLiked ? 'bg-gradient-to-br from-purple-700 to-blue-300' : 'bg-gradient-to-br from-purple-700 to-blue-300'}`}>
                  {isLiked ? <Heart size={14} className="text-white" fill="white" /> : <Music size={14} className="text-white" />}
                </div>
                <span className="truncate">{playlist.title}</span>
              </button>
            );
          })}
          {playlists.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">No playlists yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddToPlaylistModal;
