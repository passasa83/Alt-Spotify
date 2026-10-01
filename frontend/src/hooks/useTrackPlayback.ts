import { usePlayerStore } from '@/stores/playerStore';

/**
 * Per-track play buttons: the track that is playing shows a pause button,
 * and clicking the current track pauses / resumes it instead of restarting it.
 */
export function useTrackPlayback() {
  const { currentTrack, isPlaying, togglePlay } = usePlayerStore();
  const currentId = currentTrack?.id;

  return {
    isCurrent: (trackId: string) => currentId === trackId,
    isPlayingTrack: (trackId: string) => currentId === trackId && isPlaying,
    /** `start` plays the track from scratch when it isn't the current one. */
    playOrToggle: (trackId: string, start: () => void) => {
      if (currentId === trackId) togglePlay();
      else start();
    },
  };
}
