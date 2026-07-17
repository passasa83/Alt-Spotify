import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, ListPlus, ListMusic, Heart, HeartOff, Trash2 } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import type { Track } from '@/types';

interface Props {
  track: Track;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  menuDirection?: 'left' | 'right';
}

const TrackContextMenu = ({ track, onAddToPlaylist, onRemoveFromPlaylist, menuDirection = 'left' }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addToQueue } = usePlayerStore();
  const { addToFavorites, removeFromFavorites, isFavorite } = useLibraryStore();
  const addToast = useToastStore((s) => s.addToast);
  const liked = isFavorite(String(track.id));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const positionClass = menuDirection === 'left' ? 'right-0' : 'left-0';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-all hover:text-white"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && (
        <div className={`absolute ${positionClass} top-8 z-50 w-56 rounded-md bg-gray-900 py-1 shadow-xl ring-1 ring-white/10`}>
          <button
            onClick={() => handleAction(() => { addToQueue(track); addToast('Added to queue'); })}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            <ListPlus size={16} />
            Add to queue
          </button>

          <button
            onClick={() => handleAction(() => onAddToPlaylist?.(track))}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            <ListMusic size={16} />
            Add to playlist
          </button>

          <div className="my-1 border-t border-gray-700" />

          {liked ? (
            <button
              onClick={() => handleAction(() => { removeFromFavorites(String(track.id)); addToast('Removed from liked songs'); })}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              <HeartOff size={16} />
              Remove from liked songs
            </button>
          ) : (
            <button
              onClick={() => handleAction(() => { addToFavorites(track); addToast('Saved to liked songs'); })}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              <Heart size={16} />
              Save to liked songs
            </button>
          )}

          {onRemoveFromPlaylist && (
            <>
              <div className="my-1 border-t border-gray-700" />
              <button
                onClick={() => handleAction(() => onRemoveFromPlaylist(track))}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
              >
                <Trash2 size={16} />
                Remove from this playlist
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackContextMenu;
