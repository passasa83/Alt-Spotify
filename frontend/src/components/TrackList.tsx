import { useState } from 'react';
import { Play, Trash2, Edit } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { Track } from '@/types';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { deleteTrack } from '@/api/tracks';
import { formatTime } from '@/utils/formatTime';
import { usePlaylistModals } from '@/hooks/usePlaylistModals';

interface TrackListProps {
  tracks: Track[];
  showAlbum?: boolean;
  showIndex?: boolean;
  onRefresh?: () => void;
  playlistTracks?: Track[];
}

const TrackList = ({ tracks, showAlbum = true, showIndex = true, onRefresh, playlistTracks }: TrackListProps) => {
  const { setTrack, setPlaylistAsQueue, currentTrack, isPlaying } = usePlayerStore();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { playlistModalTrack, showCreateModal, openAddToPlaylist, openCreatePlaylist, closeAddToPlaylist, closeCreatePlaylist } = usePlaylistModals();

  const handlePlayTrack = (track: Track) => {
    if (playlistTracks && playlistTracks.length > 0) {
      const trackIndex = playlistTracks.findIndex(t => t.id === track.id);
      setPlaylistAsQueue(playlistTracks, trackIndex >= 0 ? trackIndex : 0);
    } else {
      setTrack(track);
    }
  };

  const handleDelete = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this track?")) {
      try {
        await deleteTrack(trackId);
        if (onRefresh) onRefresh();
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, track: Track) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePlayTrack(track);
    }
  };

  return (
    <div className="w-full">
      {showIndex && (
        <div className="mb-2 grid grid-cols-[16px_4fr_3fr_minmax(80px,1fr)_32px] gap-4 border-b border-gray-700 px-4 py-2 text-xs uppercase tracking-wider text-gray-400 md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]">
          <span className="text-right">#</span>
          <span>{t('player.next').includes('Next') ? 'Title' : 'Titre'}</span>
          {showAlbum && <span className="hidden md:block">{t('nav.albums')}</span>}
          <span className="hidden md:block">{t('playlist.track_added')}</span>
          <span className="text-right">{t('player.now_playing').includes('Now') ? 'Duration' : 'Durée'}</span>
          <span />
        </div>
      )}

      <div className="space-y-0.5" role="list" aria-label={t('nav.playlists')}>
        {tracks.map((track, index) => {
          const isCurrentTrack = currentTrack?.id === track.id;

          return (
            <div
              key={track.id}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => handleKeyDown(e, track)}
              className={`group grid cursor-pointer items-center gap-4 rounded-md px-4 py-2 transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-green-500 ${
                isCurrentTrack ? 'bg-gray-800' : ''
              } ${showIndex ? 'grid-cols-[16px_4fr_3fr_minmax(80px,1fr)_32px] md:grid-cols-[16px_4fr_2fr_3fr_minmax(80px,1fr)_32px]' : 'grid-cols-[4fr_3fr_minmax(80px,1fr)_32px] md:grid-cols-[4fr_2fr_3fr_minmax(80px,1fr)_32px]'}`}
              onDoubleClick={() => handlePlayTrack(track)}
            >
              {showIndex && (
                <div className="flex items-center justify-end">
                  <span className={`text-sm ${isCurrentTrack ? 'text-green-500' : 'text-gray-400 group-hover:hidden'}`}>
                    {isCurrentTrack && isPlaying ? '♪' : index + 1}
                  </span>
                  <button
                    onClick={() => handlePlayTrack(track)}
                    className="hidden text-white group-hover:block"
                    aria-label={`${t('player.play')} ${track.title}`}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                {!showIndex && (
                  <button
                    onClick={() => handlePlayTrack(track)}
                    className="hidden text-white group-hover:block"
                    aria-label={`${t('player.play')} ${track.title}`}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                )}
                <img
                  src={track.cover_url || track.album?.cover_url || '/placeholder-album.svg'}
                  alt={track.title}
                  className="h-10 w-10 rounded object-cover"
                />
                <div className="min-w-0">
                  <Link
                    to={`/track/${track.id}`}
                    className={`block truncate text-sm font-medium hover:underline ${
                      isCurrentTrack ? 'text-green-500' : 'text-white'
                    }`}
                  >
                    {track.title}
                  </Link>
                  <Link
                    to={`/artist/${track.artist?.id || track.artist_id}`}
                    className="block truncate text-xs text-gray-400 hover:underline"
                  >
                    {track.artist?.name || t('player.unknown_artist')}
                  </Link>
                </div>
              </div>

              {showAlbum && (
                <span className="hidden truncate text-sm text-gray-400 md:block hover:underline">
                  <Link to={`/album/${track.album_id}`}>{track.album?.title || t('player.unknown_album')}</Link>
                </span>
              )}

              <span className="hidden text-sm text-gray-400 md:block">{t('playlist.track_added')}</span>

              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-gray-400">{formatTime(track.duration_seconds)}</span>
                {isAdmin && (
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                    <Link 
                      to={`/admin/tracks/${track.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-400 hover:text-white"
                    >
                      <Edit size={14} />
                    </Link>
                    <button
                      onClick={(e) => handleDelete(e, track.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                <div className="opacity-0 group-hover:opacity-100">
                  <TrackContextMenu
                    track={track}
                    onAddToPlaylist={(t) => openAddToPlaylist(t)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AddToPlaylistModal
        isOpen={!!playlistModalTrack}
        onClose={closeAddToPlaylist}
        track={playlistModalTrack}
        onCreateNew={openCreatePlaylist}
      />
      <CreatePlaylistModal
        isOpen={showCreateModal}
        onClose={closeCreatePlaylist}
      />
    </div>
  );
};

export default TrackList;
