import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { getTrackStreamUrl } from '@/api/tracks';

export const usePlayer = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    progress,
    setTrack,
    play,
    pause,
    togglePlay,
    next,
    prev,
    setVolume,
    seek,
    setDuration,
    addToQueue,
    removeFromQueue,
    clearQueue,
    toggleShuffle,
    toggleRepeat,
    shuffle,
    repeat,
    queue,
    history,
  } = usePlayerStore();

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      if (audio.currentTime) {
        seek(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      next();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.src = getTrackStreamUrl(currentTrack.id);
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      seek(time);
    }
  }, []);

  return {
    currentTrack,
    isPlaying,
    volume,
    progress,
    shuffle,
    repeat,
    queue,
    history,
    setTrack,
    play,
    pause,
    togglePlay,
    next,
    prev,
    setVolume,
    seek: handleSeek,
    addToQueue,
    removeFromQueue,
    clearQueue,
    toggleShuffle,
    toggleRepeat,
  };
};
