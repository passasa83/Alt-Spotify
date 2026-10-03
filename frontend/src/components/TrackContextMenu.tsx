import { useRef, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePopover } from '@/hooks/usePopover';
import { MoreHorizontal, ListPlus, ListMusic, Heart, HeartOff, Trash2, Edit, Disc3, User, Music } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useToastStore } from '@/stores/toastStore';
import { useTranslation } from '@/hooks/useTranslation';
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

const MENU_HEIGHT = 340;
const MENU_WIDTH = 224; // w-56

// 44 px rows on touch screens, compact ones with a mouse.
const itemClass = 'flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-gray-800 pointer-coarse:min-h-11';

const TrackContextMenu = ({ track, onAddToPlaylist, onRemoveFromPlaylist, menuDirection = 'left', onEdit, onDelete }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const { isOpen, toggle, close } = usePopover(`track-menu-${useId()}`, [menuRef]);
  const { addToQueue } = usePlayerStore();
  const { addToFavorites, removeFromFavorites, isFavorite } = useLibraryStore();
  const addToast = useToastStore((s) => s.addToast);
  const liked = isFavorite(String(track.id));
  const artistId = track.artist?.id || track.artist_id;

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
  const positionClass = `${alignRight ? 'right-0' : 'left-0'} ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-all hover:text-white pointer-coarse:h-11 pointer-coarse:w-11"
        aria-label={t('menu.more_options', { title: track.title })}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={18} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute ${positionClass} z-50 w-56 max-w-[calc(100vw-1.5rem)] rounded-md bg-gray-900 py-1 text-gray-200 shadow-xl ring-1 ring-white/10`}
        >
          <button role="menuitem" onClick={() => handleAction(() => { addToQueue(track); addToast(t('menu.added_to_queue')); })} className={itemClass}>
            <ListPlus size={16} />
            {t('menu.add_to_queue')}
          </button>

          <button role="menuitem" onClick={() => handleAction(() => onAddToPlaylist?.(track))} className={itemClass}>
            <ListMusic size={16} />
            {t('menu.add_to_playlist')}
          </button>

          {liked ? (
            <button
              role="menuitem"
              onClick={() => handleAction(() => { removeFromFavorites(String(track.id)); addToast(t('menu.removed_from_liked')); })}
              className={itemClass}
            >
              <HeartOff size={16} />
              {t('player.unlike')}
            </button>
          ) : (
            <button
              role="menuitem"
              onClick={() => handleAction(() => { addToFavorites(track); addToast(t('menu.saved_to_liked')); })}
              className={itemClass}
            >
              <Heart size={16} />
              {t('player.like')}
            </button>
          )}

          {/* On touch screens the title and artist are not links (the row plays): go there from here. */}
          <div className="my-1 border-t border-gray-700" />
          {artistId && (
            <button role="menuitem" onClick={() => handleAction(() => navigate(`/artist/${artistId}`))} className={itemClass}>
              <User size={16} />
              {t('menu.go_to_artist')}
            </button>
          )}
          {track.album_id && (
            <button role="menuitem" onClick={() => handleAction(() => navigate(`/album/${track.album_id}`))} className={itemClass}>
              <Disc3 size={16} />
              {t('menu.go_to_album')}
            </button>
          )}
          <button role="menuitem" onClick={() => handleAction(() => navigate(`/track/${track.id}`))} className={itemClass}>
            <Music size={16} />
            {t('menu.go_to_track')}
          </button>

          {onRemoveFromPlaylist && (
            <>
              <div className="my-1 border-t border-gray-700" />
              <button role="menuitem" onClick={() => handleAction(() => onRemoveFromPlaylist(track))} className={`${itemClass} text-red-400`}>
                <Trash2 size={16} />
                {t('menu.remove_from_playlist')}
              </button>
            </>
          )}

          {(onEdit || onDelete) && (
            <>
              <div className="my-1 border-t border-gray-700" />
              {onEdit && (
                <button role="menuitem" onClick={() => handleAction(() => onEdit(track))} className={itemClass}>
                  <Edit size={16} />
                  {t('menu.edit_track')}
                </button>
              )}
              {onDelete && (
                <button role="menuitem" onClick={() => handleAction(() => onDelete(track))} className={`${itemClass} text-red-400`}>
                  <Trash2 size={16} />
                  {t('menu.delete_track')}
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
