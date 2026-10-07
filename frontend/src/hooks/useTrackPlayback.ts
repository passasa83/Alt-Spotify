import { usePlayerStore } from '@/stores/playerStore';

/**
 * Per-track play buttons: the track that is playing shows a pause button,
 * and clicking the current track pauses / resumes it instead of restarting it.
 * The album variants do the same for album play buttons (cards, detail page),
 * matching on the current track's album.
 */
export function useTrackPlayback() {
  const { currentTrack, isPlaying, togglePlay } = usePlayerStore();
  const currentId = currentTrack?.id;
  const currentAlbumId = currentTrack?.album_id;

  return {
    isCurrent: (trackId: string) => currentId === trackId,
    isPlayingTrack: (trackId: string) => currentId === trackId && isPlaying,
    /** `start` plays the track from scratch when it isn't the current one. */
    playOrToggle: (trackId: string, start: () => void) => {
      if (currentId === trackId) togglePlay();
      else start();
    },
    isCurrentAlbum: (albumId: string) => currentAlbumId === albumId,
    isPlayingAlbum: (albumId: string) => currentAlbumId === albumId && isPlaying,
    /** `start` plays the album from scratch when it isn't the current one. */
    playOrToggleAlbum: (albumId: string, start: () => void) => {
      if (currentAlbumId === albumId) togglePlay();
      else start();
    },
  };
}
