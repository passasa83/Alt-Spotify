import { useEffect, type RefObject } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { resolveCoverUrl } from '@/api/tracks';

const SEEK_STEP = 10;
let volumeBeforeMute = 0.7;

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const seekBy = (audio: HTMLAudioElement | null, delta: number) => {
  if (!audio || !Number.isFinite(audio.duration)) return;
  const time = Math.min(Math.max(audio.currentTime + delta, 0), audio.duration);
  audio.currentTime = time;
  usePlayerStore.getState().seek(time);
};

/**
 * OS integration for the player: media keys / lock screen controls (Media
 * Session API), the browser tab title, and keyboard shortcuts.
 */
export function useMediaSession(audioRef: RefObject<HTMLAudioElement | null>) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // Tab title: "♪ Title · Artist" while a track is loaded.
  useEffect(() => {
    if (!currentTrack) return;
    const original = document.title;
    const artist = currentTrack.artist?.name;
    document.title = `${isPlaying ? '♪ ' : ''}${currentTrack.title}${artist ? ` · ${artist}` : ''}`;
    return () => {
      document.title = original;
    };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    const cover = resolveCoverUrl(currentTrack.cover_url || currentTrack.album?.cover_url);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist?.name ?? '',
      album: currentTrack.album?.title ?? '',
      artwork: [{ src: new URL(cover, window.location.origin).href, sizes: '512x512' }],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const store = () => usePlayerStore.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => store().play()],
      ['pause', () => store().pause()],
      ['previoustrack', () => store().prev()],
      ['nexttrack', () => store().next()],
      ['seekbackward', (d) => seekBy(audioRef.current, -(d.seekOffset ?? SEEK_STEP))],
      ['seekforward', (d) => seekBy(audioRef.current, d.seekOffset ?? SEEK_STEP)],
      [
        'seekto',
        (d) => {
          if (audioRef.current && d.seekTime != null) {
            audioRef.current.currentTime = d.seekTime;
            store().seek(d.seekTime);
          }
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [audioRef]);

  // Keyboard shortcuts, ignored while typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const store = usePlayerStore.getState();
      if (!store.currentTrack) return;
      switch (e.key) {
        case ' ':
          // Let a focused button handle its own Space press.
          if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
          e.preventDefault();
          store.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) store.next();
          else seekBy(audioRef.current, SEEK_STEP);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) store.prev();
          else seekBy(audioRef.current, -SEEK_STEP);
          break;
        case 'm':
        case 'M':
          if (store.volume > 0) {
            volumeBeforeMute = store.volume;
            store.setVolume(0);
          } else {
            store.setVolume(volumeBeforeMute);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioRef]);
}
