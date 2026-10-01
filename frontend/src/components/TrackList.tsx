import { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import TrackContextMenu from '@/components/TrackContextMenu';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import type { Track } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { deleteTrack, resolveCoverUrl } from '@/api/tracks';
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
  const isAdmin = user?.role === 'ADMIN';
  const { playlistModalTrack, showCreateModal, openAddToPlaylist, openCreatePlaylist, closeAddToPlaylist, closeCreatePlaylist } = usePlaylistModals();

  const { isPlayingTrack, playOrToggle } = useTrackPlayback();
  const handlePlayTrack = (track: Track) => {
    if (playlistTracks && playlistTracks.length > 0) {
      const trackIndex = playlistTracks.findIndex(t => t.id === track.id);
      setPlaylistAsQueue(playlistTracks, trackIndex >= 0 ? trackIndex : 0);
    } else {
      setTrack(track);
    }
  };

  const navigate = useNavigate();
  const handleDelete = async (trackId: string) => {
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
        <div className="mb-2 grid grid-cols-[16px_minmax(0,1fr)_auto] gap-3 border-b border-gray-700 px-3 py-2 text-xs uppercase tracking-wider text-gray-400 md:gap-4 md:px-4 md:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,3fr)_minmax(80px,1fr)_72px]">
          <span className="text-right">#</span>
          <span>{t('player.next').includes('Next') ? 'Title' : 'Titre'}</span>
          {showAlbum ? <span className="hidden md:block">{t('nav.albums')}</span> : <span className="hidden md:block" />}
          <span className="hidden md:block">{t('playlist.track_added')}</span>
          <span className="hidden text-right md:block">{t('player.now_playing').includes('Now') ? 'Duration' : 'Durée'}</span>
          <span className="hidden md:block" />
          <span className="md:hidden" />
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
              className={`group grid cursor-pointer items-center gap-3 rounded-md px-3 py-2 md:gap-4 md:px-4 transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-green-500 ${
                isCurrentTrack ? 'bg-gray-800' : ''
              } ${showIndex ? 'grid-cols-[16px_minmax(0,1fr)_auto] md:grid-cols-[16px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,3fr)_minmax(80px,1fr)_72px]' : 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,4fr)_minmax(0,2fr)_minmax(0,3fr)_minmax(80px,1fr)_72px]'}`}
              onDoubleClick={() => handlePlayTrack(track)}
            >
              {showIndex && (
                <div className="flex items-center justify-end">
                  <span className={`text-sm [@media(hover:none)]:hidden ${isCurrentTrack ? 'text-green-500' : 'text-gray-400 group-hover:hidden'}`}>
                    {isCurrentTrack && isPlaying ? '♪' : index + 1}
                  </span>
                  {(track.file_url || track.hls_path) ? (
                    <button
                      onClick={() => playOrToggle(track.id, () => handlePlayTrack(track))}
                      className="hidden text-white group-hover:block [@media(hover:none)]:block"
                      aria-label={`${isPlayingTrack(track.id) ? t('player.pause') : t('player.play')} ${track.title}`}
                    >
                      {isPlayingTrack(track.id) ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                  ) : (
                    <span className="hidden text-gray-600 group-hover:block [@media(hover:none)]:block">—</span>
                  )}
                </div>
              )}

              <div className="flex min-w-0 items-center gap-3">
                {!showIndex && (
                  (track.file_url || track.hls_path) ? (
                    <button
                      onClick={() => playOrToggle(track.id, () => handlePlayTrack(track))}
                      className="hidden flex-shrink-0 text-white group-hover:block [@media(hover:none)]:block"
                      aria-label={`${isPlayingTrack(track.id) ? t('player.pause') : t('player.play')} ${track.title}`}
                    >
                      {isPlayingTrack(track.id) ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                  ) : (
                    <span className="hidden text-gray-600 group-hover:block [@media(hover:none)]:block">—</span>
                  )
                )}
                <img
                  src={resolveCoverUrl(track.cover_url || track.album?.cover_url)}
                  alt={track.title}
                  className="h-10 w-10 flex-shrink-0 rounded object-cover"
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

              {showAlbum ? (
                <span className="hidden truncate text-sm text-gray-400 md:block hover:underline">
                  <Link to={`/album/${track.album_id}`}>{track.album?.title || t('player.unknown_album')}</Link>
                </span>
              ) : (
                <span className="hidden md:block" />
              )}

              <span className="hidden truncate text-sm text-gray-400 md:block">{t('playlist.track_added')}</span>

              <span className="hidden text-right text-sm text-gray-400 md:block">{formatTime(track.duration_seconds)}</span>

              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-gray-400 md:hidden">{formatTime(track.duration_seconds)}</span>
                {/* Everything else (admin actions included) lives in this menu. */}
                <div className="opacity-0 focus-within:opacity-100 [@media(hover:none)]:opacity-100 group-hover:opacity-100">
                  <TrackContextMenu
                    track={track}
                    onAddToPlaylist={(t) => openAddToPlaylist(t)}
                    onEdit={isAdmin ? (t) => navigate(`/admin/tracks/${t.id}/edit`) : undefined}
                    onDelete={isAdmin ? (t) => handleDelete(t.id) : undefined}
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
