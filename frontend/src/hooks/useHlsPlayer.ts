import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { usePlayerStore } from '@/stores/playerStore';
import { getTrackStreamUrl, getHlsStreamUrl } from '@/api/tracks';

export const useHlsPlayer = () => {
  const hlsRef = useRef<Hls | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    useHls,
    seek,
    setDuration,
    next,
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
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (useHls && currentTrack.hls_path && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(getHlsStreamUrl(currentTrack.id));
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isPlaying) {
          audio.play().catch(() => {});
        }
      });
    } else {
      audio.src = getTrackStreamUrl(currentTrack.id);
      audio.load();
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [currentTrack, useHls]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  return { audioRef };
};
