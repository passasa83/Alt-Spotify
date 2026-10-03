import { X } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { resolveCoverUrl } from '@/api/tracks';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTime } from '@/utils/formatTime';
import type { Track } from '@/types';

interface QueuePanelProps {
  onClose: () => void;
}

const QueueRow = ({ track, active, onPlay, onRemove }: {
  track: Track;
  active?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-700/60">
      <button
        onClick={onPlay}
        disabled={!onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <img
          src={resolveCoverUrl(track.cover_url || track.album?.cover_url)}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded object-cover"
        />
        <span className="min-w-0">
          <span className={`block truncate text-sm ${active ? 'font-bold text-green-400' : 'text-white'}`}>{track.title}</span>
          <span className="block truncate text-xs text-gray-400">
            {track.artist?.name || t('player.unknown_artist')}
          </span>
        </span>
      </button>
      <span className="text-xs text-gray-500">{formatTime(track.duration_seconds)}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-1 text-gray-500 opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={t('player.remove_from_queue')}
          title={t('player.remove_from_queue')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

/** Current track and what comes next; also shown in the mobile "Now playing" screen. */
export const QueueContent = () => {
  const { t } = useTranslation();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const { next, removeFromQueue, clearQueue } = usePlayerStore.getState();

  return (
    <>
      {currentTrack && (
        <>
          <p className="px-2 pb-1 text-xs uppercase tracking-wider text-gray-500">{t('player.now_playing')}</p>
          <QueueRow track={currentTrack} active />
        </>
      )}

      <div className="mt-3 flex items-center justify-between px-2 pb-1">
        <p className="text-xs uppercase tracking-wider text-gray-500">
          {t('player.up_next')} {queue.length > 0 && `(${queue.length})`}
        </p>
        {queue.length > 0 && (
          <button onClick={clearQueue} className="text-xs text-gray-400 hover:text-white">
            {t('player.clear_queue')}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <p className="px-2 py-3 text-sm text-gray-400">{t('player.queue_empty')}</p>
        ) : (
          queue.map((track) => (
            <QueueRow
              key={track.id}
              track={track}
              onPlay={() => next(track)}
              onRemove={() => removeFromQueue(track.id)}
            />
          ))
        )}
      </div>
    </>
  );
};

const QueuePanel = ({ onClose }: QueuePanelProps) => {
  const { t } = useTranslation();
  return (
    <div
      className="absolute bottom-full right-0 z-50 mb-2 flex max-h-[70vh] w-full flex-col rounded-lg bg-gray-800 p-3 shadow-xl ring-1 ring-white/10 sm:right-4 sm:w-96"
      role="dialog"
      aria-label={t('player.queue')}
    >
      <div className="mb-2 flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold text-white">{t('player.queue')}</h3>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label={t('action.close')}>
          <X size={16} />
        </button>
      </div>
      <QueueContent />
    </div>
  );
};

export default QueuePanel;
