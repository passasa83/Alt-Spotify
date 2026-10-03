import { useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';
import { getHlsStreamUrl, getTrackStreamUrl, playTrack } from '../api/tracks';
import { withMediaToken } from '../api/mediaToken';
import { getOfflineTrackUri } from '../services/offlineStorage';
import { configureBackgroundAudio } from '../services/backgroundAudio';
import type { Track } from '../types';

// Seconds of listening before a play counts (history, stats), like the web app.
const PLAY_RECORD_THRESHOLD = 10;

/** Downloaded file, else adaptive HLS when transcoded, else the original file. */
const sourceFor = async (track: Track): Promise<string> => {
  const offline = await getOfflineTrackUri(track.id);
  if (offline) return offline;
  // Players cannot send headers: the URL carries the restricted media token
  // (the server passes it on to the HLS variants and segments).
  return withMediaToken(track.hls_path ? getHlsStreamUrl(track.id) : getTrackStreamUrl(track.id));
};

/**
 * Plays the store's current track. Mounted once, by the player host in App.
 */
export const useAudioPlayer = () => {
  const soundRef = useRef<Audio.Sound | null>(null);
  // Bumped on every track change: a slow load must not start an old track.
  const loadIdRef = useRef(0);
  const listenedRef = useRef<{ trackId: string | null; seconds: number; recorded: boolean }>({
    trackId: null,
    seconds: 0,
    recorded: false,
  });
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);

  useEffect(() => {
    configureBackgroundAudio();
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (!currentTrack) return;
    const loadId = ++loadIdRef.current;
    listenedRef.current = { trackId: currentTrack.id, seconds: 0, recorded: false };

    const load = async () => {
      const previous = soundRef.current;
      soundRef.current = null;
      await previous?.unloadAsync().catch(() => {});
      try {
        const uri = await sourceFor(currentTrack);
        if (loadId !== loadIdRef.current) return;
        const { volume: vol, isPlaying: playing } = usePlayerStore.getState();
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: playing, volume: vol, progressUpdateIntervalMillis: 500 },
          (status) => {
            if (!status.isLoaded || loadId !== loadIdRef.current) return;
            const store = usePlayerStore.getState();
            const seconds = status.positionMillis / 1000;
            // Count real listening time once, past the threshold.
            const listened = listenedRef.current;
            if (status.isPlaying) listened.seconds += 0.5;
            if (!listened.recorded && listened.seconds >= PLAY_RECORD_THRESHOLD) {
              listened.recorded = true;
              playTrack(currentTrack.id).catch(() => {});
            }
            store.seek(seconds);
            if (status.durationMillis) store.setDuration(status.durationMillis / 1000);
            if (status.didJustFinish) {
              if (store.repeat === 'one') {
                sound.replayAsync().catch(() => {});
              } else {
                store.next();
              }
            }
          },
        );
        if (loadId !== loadIdRef.current) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch {
        // Unreachable or refused stream (401/404...): move on rather than hang.
        if (loadId === loadIdRef.current) usePlayerStore.getState().next();
      }
    };

    load();
  }, [currentTrack?.id]);

  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) return;
    (isPlaying ? sound.playAsync() : sound.pauseAsync()).catch(() => {});
  }, [isPlaying]);

  useEffect(() => {
    soundRef.current?.setVolumeAsync(volume).catch(() => {});
  }, [volume]);

  const seekTo = useCallback(async (seconds: number) => {
    await soundRef.current?.setPositionAsync(seconds * 1000).catch(() => {});
  }, []);

  return { seekTo };
};
