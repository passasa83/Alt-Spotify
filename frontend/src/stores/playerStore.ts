import { create } from 'zustand';
import type { Track, LyricsLine } from '@/types';
import type { Device } from '@/api/devices';
import { registerDevice, sendHeartbeat, getDevices } from '@/api/devices';

export type RepeatMode = 'off' | 'one' | 'all';

function generateDeviceId(): string {
  const stored = localStorage.getItem('device_id');
  if (stored) return stored;
  const id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('device_id', id);
  return id;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

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
  playbackRate: number;
  offlineTracks: Map<string, Blob>;
  deviceId: string;
  connectedDevices: Device[];
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
  setPlaylistAsQueue: (tracks: Track[], startIndex?: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setLyrics: (lyrics: LyricsLine[]) => void;
  toggleLyrics: () => void;
  setUseHls: (use: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  toggleReplayGain: () => void;
  setPlaybackRate: (rate: number) => void;
  downloadTrack: (trackId: string, blob: Blob) => void;
  removeDownload: (trackId: string) => void;
  isDownloaded: (trackId: string) => boolean;
  initDevice: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  transferPlayback: (deviceId: string) => Promise<void>;
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
  playbackRate: 1,
  offlineTracks: new Map(),
  deviceId: generateDeviceId(),
  connectedDevices: [],

  initDevice: async () => {
    const { deviceId } = get();
    try {
      const deviceName = navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Web Browser';
      await registerDevice(deviceId, deviceName, 'web');

      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        sendHeartbeat(deviceId).catch(() => {});
      }, 30000);

      const devices = await getDevices();
      set({ connectedDevices: devices });
    } catch {
      // Device registration failed silently
    }
  },

  refreshDevices: async () => {
    try {
      const devices = await getDevices();
      set({ connectedDevices: devices });
    } catch {
      // silently fail
    }
  },

  transferPlayback: async (targetDeviceId: string) => {
    const { deviceId } = get();
    try {
      const { transferPlayback: apiTransfer } = await import('@/api/devices');
      await apiTransfer(targetDeviceId);
      await get().refreshDevices();
    } catch {
      // silently fail
    }
  },

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

  setPlaylistAsQueue: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const { currentTrack, history } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    const trackToPlay = tracks[startIndex];
    const queueTracks = tracks.filter((_, index) => index !== startIndex);
    set({
      currentTrack: trackToPlay,
      queue: queueTracks,
      isPlaying: true,
      progress: 0,
    });
  },

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

  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.5, Math.min(3, rate)) }),

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
