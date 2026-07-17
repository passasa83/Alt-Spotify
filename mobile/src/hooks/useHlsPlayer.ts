import React, { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { getTrackStreamUrl, getHlsStreamUrl } from '../api/tracks';
import { Audio } from 'expo-av';
import { configureBackgroundAudio } from '../services/backgroundAudio';

export const useHlsPlayer = () => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    setDuration,
    next,
  } = usePlayerStore();

  useEffect(() => {
    if (!currentTrack) return;

    const loadTrack = async () => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const uri = getTrackStreamUrl(currentTrack.id);

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: true,
          volume,
          progressUpdateIntervalMillis: 500,
        },
        (status) => {
          if (status.isLoaded) {
            usePlayerStore.getState().seek(status.positionMillis / 1000);
            if (status.durationMillis) {
              setDuration(status.durationMillis / 1000);
            }
            if (status.didJustFinish) {
              next();
            }
          }
        }
      );

      soundRef.current = sound;

      await configureBackgroundAudio();
    };

    loadTrack();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!soundRef.current) return;
    if (isPlaying) {
      soundRef.current.playAsync();
    } else {
      soundRef.current.pauseAsync();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(volume);
    }
  }, [volume]);

  return { soundRef };
};
