import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAlbum, getAlbumTracks } from '@/api/albums';
import { usePlayerStore } from '@/stores/playerStore';
import TrackList from '@/components/TrackList';
import { Play, Heart, MoreHorizontal, Shuffle } from 'lucide-react';
import type { Album, Track } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const AlbumDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  useEffect(() => {
    const loadAlbum = async () => {
      if (!id) return;
      try {
        const [albumData, tracksData] = await Promise.all([
          getAlbum(parseInt(id)),
          getAlbumTracks(parseInt(id)),
        ]);
        setAlbum(albumData);
        setTracks(tracksData);
      } catch {
        console.error('Failed to load album');
      } finally {
        setIsLoading(false);
      }
    };
    loadAlbum();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-green-500"></div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">{t('album.not_found')}</p>
      </div>
    );
  }

  const totalDuration = tracks.reduce((acc, track) => acc + track.duration, 0);
  const minutes = Math.floor(totalDuration / 60);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setTrack(tracks[0]!);
    }
  };

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-6 md:flex-row md:items-end">
        <img
          src={album.cover_url || '/placeholder-album.svg'}
          alt={album.title}
          className="h-48 w-48 rounded-md object-cover shadow-2xl md:h-56 md:w-56"
        />
        <div>
          <p className="text-sm font-medium uppercase text-white">{t('album.album')}</p>
          <h1 className="mt-2 text-4xl font-bold text-white md:text-6xl">{album.title}</h1>
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
            <Link to={`/artist/${album.artist?.id || album.artist_id}`} className="font-medium text-white hover:underline">
              {album.artist?.name || t('player.unknown_artist')}
            </Link>
            <span>•</span>
            <span>{album.release_year || new Date(album.created_at).getFullYear()}</span>
            <span>•</span>
            <span>{t('album.songs_about_min', { count: tracks.length, minutes })}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <button
          onClick={handlePlayAll}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-black transition-transform hover:scale-105"
        >
          <Play size={24} fill="currentColor" />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <Shuffle size={24} />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <Heart size={24} />
        </button>
        <button className="text-gray-400 transition-colors hover:text-white">
          <MoreHorizontal size={24} />
        </button>
      </div>

      <TrackList tracks={tracks} showAlbum={false} />
    </div>
  );
};

export default AlbumDetail;
