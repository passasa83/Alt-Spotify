import { Play } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import type { Album } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAlbumTracks } from '@/api/albums';
import { useTranslation } from '@/hooks/useTranslation';

interface AlbumCardProps {
  album: Album;
}

const AlbumCard = ({ album }: AlbumCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setTrack, currentTrack, isPlaying } = usePlayerStore();
  const [tracks, setTracks] = useState<[]>([]);

  useEffect(() => {
    getAlbumTracks(album.id).then(setTracks).catch(() => {});
  }, [album.id]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (tracks.length > 0) {
      setTrack(tracks[0]!);
    }
  };

  return (
    <Link
      to={`/album/${album.id}`}
      className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800"
    >
      <div className="relative mb-3">
        <img
          src={album.cover_url || '/placeholder-album.svg'}
          alt={album.title}
          className="h-40 w-full rounded-md object-cover shadow-lg"
        />
        <button
          onClick={handlePlay}
          className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-black shadow-xl transition-all ${
            isPlaying
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
          }`}
        >
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <p className="block truncate text-sm font-semibold text-white">{album.title}</p>
      <p className="block truncate text-xs text-gray-400">
        {album.release_year} • <span className="hover:underline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (album.artist_id) navigate(`/artist/${album.artist_id}`); }}>{album.artist?.name || t('player.unknown_artist')}</span>
      </p>
    </Link>
  );
};

export default AlbumCard;
