import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTrack } from '@/api/tracks';
import { usePlayerStore } from '@/stores/playerStore';
import { Play, Pause, Heart, MoreHorizontal } from 'lucide-react';
import type { Track } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const TrackDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [track, setTrackData] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  useEffect(() => {
    const loadTrack = async () => {
      if (!id) return;
      try {
        const data = await getTrack(parseInt(id));
        setTrackData(data);
      } catch {
        console.error('Failed to load track');
      } finally {
        setIsLoading(false);
      }
    };
    loadTrack();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Track not found</p>
      </div>
    );
  }

  const isCurrentTrack = currentTrack?.id === track.id;

  const handlePlay = () => {
    if (isCurrentTrack) {
      togglePlay();
    } else {
      setTrack(track);
    }
  };

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
        <img
          src={track.cover_url || track.album?.cover_url || '/placeholder-album.svg'}
          alt={track.title}
          className="h-48 w-48 rounded-md object-cover shadow-2xl md:h-56 md:w-56"
        />
        <div>
          <p className="text-sm font-medium uppercase text-white">Song</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">{track.title}</h1>
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
            <Link to={`/artist/${track.artist_id}`} className="font-medium text-white hover:underline">
              {track.artist?.name || t('player.unknown_artist')}
            </Link>
            <span>•</span>
            <Link to={`/album/${track.album_id}`} className="hover:underline">
              {track.album?.title || t('player.unknown_album')}
            </Link>
            <span>•</span>
            <span>{track.release_year || new Date(track.created_at).getFullYear()}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handlePlay}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          {isCurrentTrack && isPlaying ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" />
          )}
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <Heart size={24} />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <MoreHorizontal size={24} />
        </button>
      </div>

      <div className="mt-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">Lyrics</h2>
        <p className="text-gray-400">Lyrics not available for this track.</p>
      </div>

      <div className="mt-8 rounded-lg bg-gray-900 p-6">
        <h2 className="mb-4 text-xl font-bold text-white">About the artist</h2>
        <Link to={`/artist/${track.artist_id}`} className="text-green-500 hover:underline">
          {track.artist?.name || t('player.unknown_artist')}
        </Link>
        <p className="mt-2 text-sm text-gray-400">
          Artist information not available.
        </p>
      </div>
    </div>
  );
};

export default TrackDetail;
