import React, { useEffect, useRef, useCallback } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';
import { getTrackStreamUrl } from '../api/tracks';
import { getOfflineTrackUri } from '../services/offlineStorage';

export const configureBackgroundAudio = async () => {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    interruptionModeAndroid: InterruptionModeAndroid.MixWithOthers,
    playThroughEarpieceAndroid: false,
  });
};

export const useAudioPlayer = () => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    crossfadeDuration,
    offlineTracks,
    setDuration,
    next,
  } = usePlayerStore();

  useEffect(() => {
    configureBackgroundAudio();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    if (!currentTrack) return;

    const loadAndPlay = async () => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      let audioUri = getTrackStreamUrl(currentTrack.id);
      const offlineUri = await getOfflineTrackUri(currentTrack.id);
      if (offlineUri) {
        audioUri = offlineUri;
      }

      const crossfadeMs = crossfadeDuration * 1000;

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay: isPlaying,
          volume,
          progressUpdateIntervalMillis: 500,
        },
        (status) => {
          if (status.isLoaded) {
            usePlayerStore.getState().seek(status.positionMillis / 1000);
            usePlayerStore.getState().setDuration(
              status.durationMillis ? status.durationMillis / 1000 : 0
            );
            if (status.didJustFinish) {
              if (crossfadeDuration > 0) {
                const fadeOutInterval = setInterval(async () => {
                  const currentVol = usePlayerStore.getState().volume;
                  if (currentVol > 0.05) {
                    await sound.setVolumeAsync(Math.max(0, currentVol - 0.05));
                  } else {
                    clearInterval(fadeOutInterval);
                    next();
                  }
                }, crossfadeMs / 20);
              } else {
                next();
              }
            }
          }
        }
      );

      soundRef.current = sound;
      setDuration(currentTrack.duration_seconds);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.MixWithOthers,
        playThroughEarpieceAndroid: false,
      });
    };

    loadAndPlay();

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

  const seekTo = useCallback(async (seconds: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(seconds * 1000);
    }
  }, []);

  return { soundRef, seekTo };
};
