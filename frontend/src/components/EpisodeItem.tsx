import { Play, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Episode } from '@/types';
import { formatDurationHms, formatDate } from '@/utils/formatTime';

interface EpisodeItemProps {
  episode: Episode;
  onPlay?: (episode: Episode) => void;
}

// Playback happens on the episode page, which holds the audio player.
const EpisodeItem = ({ episode, onPlay }: EpisodeItemProps) => {
  return (
    <Link
      to={`/podcasts/episode/${episode.id}`}
      onClick={() => onPlay?.(episode)}
      className="flex items-center gap-4 rounded-md p-3 transition-colors hover:bg-gray-800 group"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500 text-black opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Play size={16} fill="currentColor" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {episode.is_played && (
            <Check size={14} className="text-green-500 flex-shrink-0" />
          )}
          <h4 className={`truncate text-sm font-medium ${episode.is_played ? 'text-gray-400' : 'text-white'}`}>
            {episode.title}
          </h4>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
          {episode.description || 'No description'}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 text-xs text-gray-500">
        {episode.season_number && (
          <span>S{episode.season_number}</span>
        )}
        {episode.episode_number && (
          <span>E{episode.episode_number}</span>
        )}
        <span>{formatDurationHms(episode.duration_seconds)}</span>
        {episode.published_at && (
          <span>{formatDate(episode.published_at)}</span>
        )}
      </div>
    </Link>
  );
};

export default EpisodeItem;
