import { useState } from 'react';
import { Play, Heart } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { Track } from '@/types';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

interface TrackCardProps {
  track: Track;
}

const TrackCard = ({ track }: TrackCardProps) => {
  const { t } = useTranslation();
  const { setTrack, currentTrack, isPlaying } = usePlayerStore();
  const { addToFavorites, removeFromFavorites, isFavorite } = useLibraryStore();
  const isCurrentTrack = currentTrack?.id === track.id;
  const liked = isFavorite(String(track.id));
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <>
      <div className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800">
        <div className="relative mb-3">
          <img
            src={track.cover_url || track.album?.cover_url || '/placeholder-album.png'}
            alt={track.title}
            className="h-40 w-full rounded-md object-cover shadow-lg"
          />
          <button
            onClick={() => setTrack(track)}
            className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-black shadow-xl transition-all ${
              isCurrentTrack && isPlaying
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
            }`}
          >
            <Play size={18} fill="currentColor" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (liked) {
                removeFromFavorites(String(track.id));
              } else {
                addToFavorites(track);
              }
            }}
            className={`absolute top-2 right-10 flex h-8 w-8 items-center justify-center rounded-full transition-all ${
              liked
                ? 'text-green-500 opacity-100'
                : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-white'
            }`}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          </button>
          <div className="absolute top-2 right-2 z-10 opacity-0 transition-all group-hover:opacity-100">
            <TrackContextMenu
              track={track}
              onAddToPlaylist={(t) => setPlaylistModalTrack(t)}
            />
          </div>
        </div>
        <Link to={`/track/${track.id}`} className="block truncate text-sm font-semibold text-white hover:underline">
          {track.title}
        </Link>
        <div className="flex items-center gap-1.5">
          {track.artist?.image_url && (
            <img
              src={track.artist.image_url}
              alt={track.artist.name}
              className="h-4 w-4 rounded-full object-cover"
            />
          )}
          <Link to={`/artist/${track.artist_id}`} className="block truncate text-xs text-gray-400 hover:underline">
            {track.artist?.name || t('player.unknown_artist')}
          </Link>
        </div>
      </div>

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={() => setPlaylistModalTrack(null)}
        track={playlistModalTrack}
        onCreateNew={() => {
          setPlaylistModalTrack(null);
          setShowCreateModal(true);
        }}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </>
  );
};

export default TrackCard;
