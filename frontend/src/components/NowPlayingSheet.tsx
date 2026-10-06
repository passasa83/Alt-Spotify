import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  type LucideIcon,
} from 'lucide-react';
import { resolveCoverUrl } from '@/api/tracks';
import { usePlayerStore } from '@/stores/playerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTime } from '@/utils/formatTime';
import SynchronizedLyrics from './SynchronizedLyrics';
import { QueueContent } from './QueuePanel';

export interface SheetAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

interface NowPlayingSheetProps {
  onClose: () => void;
  /** A link was followed: hide the sheet without going back in history. */
  onNavigate: () => void;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  isLiked: boolean;
  onToggleLike: () => void;
  /** Download, equalizer, settings, jam... (they close the sheet first if they open a panel). */
  actions: SheetAction[];
}

type View = 'cover' | 'queue' | 'lyrics';

// Past this drag distance (px), letting go closes the sheet.
const CLOSE_DISTANCE = 110;

/** Full-screen "Now playing" view for phones, opened from the mini player. */
const NowPlayingSheet = ({ onClose, onNavigate, progress, duration, onSeek, isLiked, onToggleLike, actions }: NowPlayingSheetProps) => {
  const { t } = useTranslation();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const lyrics = usePlayerStore((s) => s.lyrics);
  const { togglePlay, next, prev, toggleShuffle, toggleRepeat } = usePlayerStore.getState();
  const [view, setView] = useState<View>('cover');
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  // Latest distance, read on touchend (the state may not have re-rendered yet).
  const dragDistance = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!currentTrack) return null;

  // Swipe down from the header or the cover to close.
  const dragHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      dragStart.current = e.touches[0]!.clientY;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (dragStart.current === null) return;
      dragDistance.current = Math.max(0, e.touches[0]!.clientY - dragStart.current);
      setDragY(dragDistance.current);
    },
    onTouchEnd: () => {
      if (dragDistance.current > CLOSE_DISTANCE) onClose();
      dragStart.current = null;
      dragDistance.current = 0;
      setDragY(0);
    },
  };

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;
  const cover = resolveCoverUrl(currentTrack.cover_url || currentTrack.album?.cover_url);
  const iconButton = 'flex h-12 w-12 items-center justify-center rounded-full';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('player.now_playing')}
      className="fixed inset-0 z-[60] flex flex-col bg-gradient-to-b from-gray-800 to-gray-950 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] text-white motion-safe:animate-[sheet-up_220ms_ease-out] md:hidden"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? 'none' : 'transform 200ms ease-out',
      }}
    >
      <div className="flex items-center justify-between" {...dragHandlers}>
        <button ref={closeRef} onClick={onClose} className={`${iconButton} -ml-2 text-gray-300`} aria-label={t('player.close_now_playing')}>
          <ChevronDown size={28} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">{t('player.now_playing')}</span>
        <span className="h-12 w-12" aria-hidden="true" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === 'cover' && (
          <div className="flex min-h-0 flex-1 items-center justify-center py-4" {...dragHandlers}>
            <img
              src={cover}
              alt={currentTrack.title}
              className="aspect-square max-h-full w-full max-w-[min(100%,24rem)] rounded-lg object-cover shadow-2xl"
            />
          </div>
        )}
        {view === 'queue' && (
          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-black/30 p-2">
            <QueueContent />
          </div>
        )}
        {view === 'lyrics' && (
          <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg bg-black/30">
            {lyrics.length > 0 ? (
              <SynchronizedLyrics lyrics={lyrics} currentTime={progress} onSeek={onSeek} />
            ) : (
              <p className="p-6 text-center text-sm text-gray-400">{t('player.no_lyrics')}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/track/${currentTrack.id}`} onClick={onNavigate} className="block truncate text-xl font-bold hover:underline">
            {currentTrack.title}
          </Link>
          <Link
            to={`/artist/${currentTrack.artist?.id || currentTrack.artist_id}`}
            onClick={onNavigate}
            className="block truncate text-sm text-gray-300 hover:underline"
          >
            {currentTrack.artist?.name || t('player.unknown_artist')}
          </Link>
        </div>
        <button
          onClick={onToggleLike}
          className={`${iconButton} ${isLiked ? 'text-green-500' : 'text-gray-300'}`}
          aria-label={isLiked ? t('player.unlike') : t('player.like')}
          aria-pressed={isLiked}
        >
          <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={progress}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          aria-label={t('player.seek')}
          aria-valuetext={`${formatTime(progress)} / ${formatTime(duration)}`}
          style={{ background: `linear-gradient(to right, #1db954 ${duration > 0 ? Math.min(100, (progress / duration) * 100) : 0}%, #4b5563 ${duration > 0 ? Math.min(100, (progress / duration) * 100) : 0}%)` }}
          className="slider-progress h-6 w-full cursor-pointer"
        />
        <div className="flex justify-between text-xs tabular-nums text-gray-400">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={toggleShuffle}
          className={`${iconButton} ${shuffle ? 'text-green-500' : 'text-gray-300'}`}
          aria-label={t('player.shuffle')}
          aria-pressed={shuffle}
        >
          <Shuffle size={22} />
        </button>
        <button onClick={prev} className={`${iconButton} text-white`} aria-label={t('player.previous')}>
          <SkipBack size={30} fill="currentColor" />
        </button>
        <button
          onClick={togglePlay}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black active:scale-95"
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
        >
          {isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
        </button>
        <button onClick={() => next()} className={`${iconButton} text-white`} aria-label={t('player.next')}>
          <SkipForward size={30} fill="currentColor" />
        </button>
        <button
          onClick={toggleRepeat}
          className={`${iconButton} ${repeat !== 'off' ? 'text-green-500' : 'text-gray-300'}`}
          aria-label={repeat === 'one' ? t('player.repeat_one') : t('player.repeat')}
          aria-pressed={repeat !== 'off'}
        >
          <RepeatIcon size={22} />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {(
          [
            { key: 'queue', label: t('player.queue'), icon: ListMusic },
            { key: 'lyrics', label: t('player.lyrics'), icon: Mic2 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(view === key ? 'cover' : key)}
            className={`${iconButton} ${view === key ? 'text-green-500' : 'text-gray-300'}`}
            aria-label={label}
            aria-pressed={view === key}
          >
            <Icon size={22} />
          </button>
        ))}
        {actions.map(({ key, label, icon: Icon, onClick, active, disabled }) => (
          <button
            key={key}
            onClick={onClick}
            disabled={disabled}
            className={`${iconButton} ${active ? 'text-green-500' : 'text-gray-300'} disabled:opacity-40`}
            aria-label={label}
            title={label}
          >
            <Icon size={22} />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};

export default NowPlayingSheet;
