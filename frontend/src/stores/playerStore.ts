import { create } from 'zustand';
import type { Track, LyricsLine } from '@/types';

export type RepeatMode = 'off' | 'one' | 'all';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  history: Track[];
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  useHls: boolean;
  lyrics: LyricsLine[];
  showLyrics: boolean;
  crossfadeDuration: number;
  replayGainEnabled: boolean;
  offlineTracks: Map<string, Blob>;
  setTrack: (track: Track) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (volume: number) => void;
  seek: (progress: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setLyrics: (lyrics: LyricsLine[]) => void;
  toggleLyrics: () => void;
  setUseHls: (use: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  toggleReplayGain: () => void;
  downloadTrack: (trackId: string, blob: Blob) => void;
  removeDownload: (trackId: string) => void;
  isDownloaded: (trackId: string) => boolean;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  history: [],
  isPlaying: false,
  volume: 0.7,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  useHls: false,
  lyrics: [],
  showLyrics: false,
  crossfadeDuration: 0,
  replayGainEnabled: true,
  offlineTracks: new Map(),

  setTrack: (track) => {
    const { currentTrack, history } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    set({ currentTrack: track, isPlaying: true, progress: 0 });
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  togglePlay: () => {
    const { isPlaying } = get();
    set({ isPlaying: !isPlaying });
  },

  next: () => {
    const { queue, currentTrack, history, shuffle, repeat } = get();
    if (queue.length === 0) {
      if (repeat === 'all' && currentTrack) {
        set({ currentTrack, progress: 0, isPlaying: true });
      } else {
        set({ isPlaying: false });
      }
      return;
    }
    const nextTrack = shuffle
      ? queue[Math.floor(Math.random() * queue.length)]
      : queue[0]!;
    const newQueue = queue.filter((t) => t.id !== nextTrack.id);
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    set({ currentTrack: nextTrack, queue: newQueue, isPlaying: true, progress: 0 });
  },

  prev: () => {
    const { history, currentTrack } = get();
    if (history.length === 0) return;
    const prevTrack = history[0]!;
    const newHistory = history.slice(1);
    if (currentTrack) {
      set({ history: newHistory, currentTrack: prevTrack, isPlaying: true, progress: 0 });
    }
  },

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  seek: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),

  addToQueue: (track) => {
    const { queue } = get();
    set({ queue: [...queue, track] });
  },

  removeFromQueue: (trackId) => {
    const { queue } = get();
    set({ queue: queue.filter((t) => t.id !== trackId) });
  },

  clearQueue: () => set({ queue: [] }),

  toggleShuffle: () => {
    const { shuffle } = get();
    set({ shuffle: !shuffle });
  },

  toggleRepeat: () => {
    const { repeat } = get();
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeat);
    set({ repeat: modes[(currentIndex + 1) % modes.length]! });
  },

  setLyrics: (lyrics) => set({ lyrics }),

  toggleLyrics: () => {
    const { showLyrics } = get();
    set({ showLyrics: !showLyrics });
  },

  setUseHls: (useHls) => set({ useHls }),

  setCrossfadeDuration: (duration) => set({ crossfadeDuration: Math.max(0, Math.min(12, duration)) }),

  toggleReplayGain: () => {
    const { replayGainEnabled } = get();
    set({ replayGainEnabled: !replayGainEnabled });
  },

  downloadTrack: (trackId, blob) => {
    const { offlineTracks } = get();
    const newMap = new Map(offlineTracks);
    newMap.set(trackId, blob);
    set({ offlineTracks: newMap });
    localStorage.setItem(`offline_${trackId}`, 'true');
  },

  removeDownload: (trackId) => {
    const { offlineTracks } = get();
    const newMap = new Map(offlineTracks);
    newMap.delete(trackId);
    set({ offlineTracks: newMap });
    localStorage.removeItem(`offline_${trackId}`);
  },

  isDownloaded: (trackId) => {
    return localStorage.getItem(`offline_${trackId}`) === 'true';
  },
}));
