import { Music, Heart } from 'lucide-react';
import type { Playlist } from '@/types';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

interface PlaylistCardProps {
  playlist: Playlist;
}

const PlaylistCard = ({ playlist }: PlaylistCardProps) => {
  const { t } = useTranslation();
  const isLikedSongs = playlist.title === 'Liked Songs';
  const colors = [
    'from-purple-700 to-blue-300',
    'from-green-700 to-cyan-300',
    'from-pink-700 to-orange-300',
    'from-red-700 to-yellow-300',
    'from-indigo-700 to-purple-300',
  ];

  const colorIndex = playlist.title ? playlist.title.charCodeAt(0) % colors.length : 0;

  return (
    <Link
      to={`/playlist/${playlist.id}`}
      className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800"
    >
      <div className="relative mb-3">
        {playlist.cover_url ? (
          <img
            src={playlist.cover_url}
            alt={playlist.title}
            className="h-40 w-full rounded-md object-cover shadow-lg"
          />
        ) : isLikedSongs ? (
          <div className="flex h-40 w-full items-center justify-center rounded-md bg-gradient-to-br from-purple-700 to-blue-300 shadow-lg">
            <Heart size={40} className="text-white" fill="white" />
          </div>
        ) : (
          <div
            className={`flex h-40 w-full items-center justify-center rounded-md bg-gradient-to-br ${colors[colorIndex]} shadow-lg`}
          >
            <Music size={40} className="text-white/80" />
          </div>
        )}
      </div>
      <p className="block truncate text-sm font-semibold text-white">{playlist.title}</p>
      <p className="block truncate text-xs text-gray-400">
        {playlist.track_count !== undefined ? `${playlist.track_count} ${t('playlist.songs')}` : t('playlist.playlist')}
      </p>
    </Link>
  );
};

export default PlaylistCard;
