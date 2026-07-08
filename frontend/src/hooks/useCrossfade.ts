import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/stores/playerStore';

export const useCrossfade = (audioRef: React.RefObject<HTMLAudioElement | null>) => {
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration);
  const nextTrack = usePlayerStore((s) => s.next);

  const startCrossfade = useCallback(() => {
    if (crossfadeDuration <= 0 || !audioRef.current) {
      nextTrack();
      return;
    }

    const currentAudio = audioRef.current;
    const store = usePlayerStore.getState();
    const queue = store.queue;
    const shuffle = store.shuffle;
    const repeat = store.repeat;

    if (queue.length === 0 && repeat !== 'all') {
      const fadeOutInterval = setInterval(() => {
        if (currentAudio.volume > 0.05) {
          currentAudio.volume = Math.max(0, currentAudio.volume - 0.05);
        } else {
          clearInterval(fadeOutInterval);
          currentAudio.volume = 0;
          nextTrack();
        }
      }, (crossfadeDuration * 1000) / 20);
      return;
    }

    const nextAudio = new Audio();
    nextAudioRef.current = nextAudio;

    const nextTrackItem = shuffle
      ? queue[Math.floor(Math.random() * queue.length)]
      : queue[0];

    if (nextTrackItem) {
      import('@/api/tracks').then(({ getTrackStreamUrl }) => {
        nextAudio.src = getTrackStreamUrl(nextTrackItem.id);
        nextAudio.volume = 0;
        nextAudio.load();

        const fadeSteps = 20;
        const fadeInterval = crossfadeDuration * 1000 / fadeSteps;
        let step = 0;

        const interval = setInterval(() => {
          step++;
          const progress = step / fadeSteps;
          const fadeOut = 1 - progress;
          const fadeIn = progress;

          if (currentAudio) {
            currentAudio.volume = Math.max(0, fadeOut * (usePlayerStore.getState().volume));
          }
          nextAudio.volume = Math.min(1, fadeIn * (usePlayerStore.getState().volume));

          if (step >= fadeSteps) {
            clearInterval(interval);
            nextAudio.play().catch(() => {});
            nextTrack();
          }
        }, fadeInterval);
      });
    } else {
      nextTrack();
    }
  }, [crossfadeDuration, audioRef, nextTrack]);

  useEffect(() => {
    return () => {
      if (nextAudioRef.current) {
        nextAudioRef.current.pause();
        nextAudioRef.current = null;
      }
    };
  }, []);

  return { startCrossfade };
};
