import { useRef, useId, useState } from 'react';
import { usePopover } from '@/hooks/usePopover';
import { MoreHorizontal, ListPlus, ListMusic, Heart, HeartOff, Trash2, Edit } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import type { Track } from '@/types';

interface Props {
  track: Track;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  menuDirection?: 'left' | 'right';
  /** Admin actions, kept in the menu so the row never runs out of room. */
  onEdit?: (track: Track) => void;
  onDelete?: (track: Track) => void;
}

const MENU_HEIGHT = 220;
const MENU_WIDTH = 224; // w-56

const TrackContextMenu = ({ track, onAddToPlaylist, onRemoveFromPlaylist, menuDirection = 'left', onEdit, onDelete }: Props) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { isOpen, toggle, close } = usePopover(`track-menu-${useId()}`, [menuRef]);
  const { addToQueue } = usePlayerStore();
  const { addToFavorites, removeFromFavorites, isFavorite } = useLibraryStore();
  const addToast = useToastStore((s) => s.addToast);
  const liked = isFavorite(String(track.id));

  const handleAction = (action: () => void) => {
    action();
    close();
  };

  // Open upward / toward the free side when the menu would be cut off by the
  // bottom of the scroll area (the player bar) or the screen edge.
  const [openUp, setOpenUp] = useState(false);
  const [alignRight, setAlignRight] = useState(menuDirection === 'left');
  const handleToggle = () => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (rect && !isOpen) {
      const bottomLimit = (document.querySelector('main')?.getBoundingClientRect().bottom ?? window.innerHeight) - 8;
      setOpenUp(rect.bottom + MENU_HEIGHT > bottomLimit && rect.top - MENU_HEIGHT > 0);
      const preferRight = menuDirection === 'left';
      setAlignRight(preferRight ? rect.right - MENU_WIDTH >= 8 : rect.left + MENU_WIDTH > window.innerWidth - 8);
    }
    toggle();
  };
  const positionClass = `${alignRight ? 'right-0' : 'left-0'} ${openUp ? 'bottom-8' : 'top-8'}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-all hover:text-white"
        aria-label={`Actions ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && (
        <div className={`absolute ${positionClass} z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-md bg-gray-900 py-1 shadow-xl ring-1 ring-white/10`}>
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

          {(onEdit || onDelete) && (
            <>
              <div className="my-1 border-t border-gray-700" />
              {onEdit && (
                <button
                  onClick={() => handleAction(() => onEdit(track))}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
                >
                  <Edit size={16} />
                  Edit track
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => handleAction(() => onDelete(track))}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-gray-800"
                >
                  <Trash2 size={16} />
                  Delete track
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackContextMenu;
