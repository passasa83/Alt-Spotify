import { useState, useEffect, useRef } from 'react';
import { X, Music } from 'lucide-react';
import { useLibraryStore } from '@/stores/libraryStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CreatePlaylistModal = ({ isOpen, onClose }: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { createPlaylist } = useLibraryStore();

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      await createPlaylist(title.trim(), description.trim() || undefined);
      onClose();
    } catch (err) {
      console.error('Failed to create playlist', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && title.trim()) {
      handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create playlist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-md bg-gray-800">
            <Music size={40} className="text-gray-500" />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="playlist-title" className="mb-1 block text-sm font-medium text-gray-300">
              Name
            </label>
            <input
              ref={inputRef}
              id="playlist-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My playlist"
              maxLength={100}
              className="w-full rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none transition-colors focus:border-green-500"
            />
          </div>
          <div>
            <label htmlFor="playlist-desc" className="mb-1 block text-sm font-medium text-gray-300">
              Description <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              id="playlist-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add an optional description"
              rows={2}
              maxLength={300}
              className="w-full resize-none rounded-md border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 outline-none transition-colors focus:border-green-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full px-6 py-2.5 text-sm font-bold text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="rounded-full bg-white px-8 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePlaylistModal;
