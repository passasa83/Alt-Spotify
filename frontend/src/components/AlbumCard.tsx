import { Pause, Play } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import type { Album, Track } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAlbumTracks } from '@/api/albums';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveCoverUrl } from '@/api/tracks';

interface AlbumCardProps {
  album: Album;
}

const AlbumCard = ({ album }: AlbumCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setPlaylistAsQueue } = usePlayerStore();
  const { isCurrentAlbum, isPlayingAlbum, playOrToggleAlbum } = useTrackPlayback();
  const [tracks, setTracks] = useState<Track[]>([]);
  const currentThisAlbum = isCurrentAlbum(album.id);
  const playingThisAlbum = isPlayingAlbum(album.id);

  useEffect(() => {
    getAlbumTracks(album.id).then(setTracks).catch(() => {});
  }, [album.id]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (tracks.length > 0) {
      playOrToggleAlbum(album.id, () => setPlaylistAsQueue(tracks, 0));
    }
  };

  return (
    <Link
      to={`/album/${album.id}`}
      className="group relative cursor-pointer rounded-md bg-gray-900 p-3 transition-colors hover:bg-gray-800"
    >
      <div className="relative mb-3">
        <img
          src={resolveCoverUrl(album.cover_url)}
          alt={album.title}
          className="h-40 w-full rounded-md object-cover shadow-lg"
        />
        <button
          onClick={handlePlay}
          aria-label={`${playingThisAlbum ? t('player.pause') : t('player.play')} ${album.title}`}
          className="absolute bottom-2 right-2 flex h-10 w-10 items-center pointer-coarse:h-11 pointer-coarse:w-11 justify-center rounded-full bg-green-500 text-black shadow-xl transition-all opacity-0 [@media(hover:none)]:opacity-100 translate-y-2 [@media(hover:none)]:translate-y-0 group-hover:opacity-100 group-hover:translate-y-0"
        >
          {playingThisAlbum ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
      </div>
      <p className={`block truncate text-sm ${currentThisAlbum ? 'font-extrabold text-green-500' : 'font-semibold text-white'}`}>{album.title}</p>
      <p className="block truncate text-xs text-gray-400">
        {album.release_date?.slice(0, 4) || album.created_at?.slice(0, 4)} • <span className="hover:underline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (album.artist_id) navigate(`/artist/${album.artist_id}`); }}>{album.artist?.name || t('player.unknown_artist')}</span>
      </p>
    </Link>
  );
};

export default AlbumCard;
