import { create } from 'zustand';
import type { Track, LyricsLine } from '@/types';
import type { Device } from '@/api/devices';
import { registerDevice, sendHeartbeat, getDevices } from '@/api/devices';
import { getAutoplayTracks } from '@/api/recommendations';

export type RepeatMode = 'off' | 'one' | 'all';

function generateDeviceId(): string {
  const stored = localStorage.getItem('device_id');
  if (stored) return stored;
  const id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('device_id', id);
  return id;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const hasAudio = (track: Track) => !!(track.file_url || track.hls_path);

// Ids the player queued by itself (rest of the playlist, autoplay), as opposed
// to tracks the user added: those stay ahead and survive a new selection.
const autoQueued = new Set<string>();
let autoplayRequest: Promise<void> | null = null;

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  // Playlist/album the user is listening from; refills the queue when it runs out.
  context: Track[] | null;
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
  restartTick: number;
  offlineTracks: Map<string, Blob>;
  deviceId: string;
  connectedDevices: Device[];
  setTrack: (track: Track) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  // `preferred`: a queued track to advance to (the one the Player preloaded).
  next: (preferred?: Track) => void;
  prev: () => void;
  setVolume: (volume: number) => void;
  seek: (progress: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  setPlaylistAsQueue: (tracks: Track[], startIndex?: number) => void;
  // Empty queue: queue the rest of the context, or similar tracks without one.
  refillQueue: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  restartCurrent: () => void;
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
  context: null,
  history: [],
  isPlaying: false,
  volume: 0.7,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  useHls: true,
  lyrics: [],
  showLyrics: false,
  crossfadeDuration: 0,
  replayGainEnabled: true,
  playbackRate: 1,
  restartTick: 0,
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
    if (!hasAudio(track)) return;
    const { currentTrack, history, queue } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    // Played on its own: drop what the previous playlist/autoplay queued.
    const userQueue = queue.filter((t) => !autoQueued.has(t.id) && t.id !== track.id);
    autoQueued.clear();
    set({ currentTrack: track, queue: userQueue, context: null, isPlaying: true, progress: 0 });
    void get().refillQueue();
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  togglePlay: () => {
    const { isPlaying } = get();
    set({ isPlaying: !isPlaying });
  },

  next: (preferred) => {
    if (get().queue.length === 0) {
      const refill = get().refillQueue();
      if (get().queue.length === 0) {
        const { repeat, currentTrack } = get();
        if ((repeat === 'all' || repeat === 'one') && currentTrack) {
          get().restartCurrent();
          return;
        }
        // Autoplay is loading: carry on once it lands, stop if nothing came back.
        refill.then(() => {
          if (get().queue.length > 0) get().next();
          else set({ isPlaying: false });
        });
        return;
      }
    }
    const { queue, currentTrack, history, shuffle } = get();
    const queued = preferred && queue.find((t) => t.id === preferred.id);
    const nextTrack = queued
      ? queued
      : shuffle
        ? queue[Math.floor(Math.random() * queue.length)]
        : queue[0]!;
    const newQueue = queue.filter((t) => t.id !== nextTrack.id);
    autoQueued.delete(nextTrack.id);
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    set({ currentTrack: nextTrack, queue: newQueue, isPlaying: true, progress: 0 });
    // Top up right away so the Player can preload what follows.
    void get().refillQueue();
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
    // User picks play before what the player queued by itself.
    const firstAuto = queue.findIndex((t) => autoQueued.has(t.id));
    const at = firstAuto === -1 ? queue.length : firstAuto;
    set({ queue: [...queue.slice(0, at), track, ...queue.slice(at)] });
  },

  removeFromQueue: (trackId) => {
    const { queue } = get();
    set({ queue: queue.filter((t) => t.id !== trackId) });
  },

  clearQueue: () => set({ queue: [] }),

  setPlaylistAsQueue: (tracks, startIndex = 0) => {
    const playable = tracks.filter(hasAudio);
    if (playable.length === 0) return;
    const { currentTrack, history } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    // The clicked track, or the next playable one if it has no audio.
    const trackToPlay = tracks.slice(startIndex).find(hasAudio) ?? playable[0]!;
    const queueTracks = playable.slice(playable.indexOf(trackToPlay) + 1);
    autoQueued.clear();
    queueTracks.forEach((t) => autoQueued.add(t.id));
    set({
      currentTrack: trackToPlay,
      queue: queueTracks,
      context: playable,
      isPlaying: true,
      progress: 0,
    });
    void get().refillQueue();
  },

  refillQueue: () => {
    const { queue, currentTrack, context, repeat, history } = get();
    if (queue.length > 0 || !currentTrack) return Promise.resolve();

    if (context && context.length > 1) {
      // Back to the playlist: the tracks after this one, then from the top.
      const i = context.findIndex((t) => t.id === currentTrack.id);
      const refill =
        i === -1
          ? context.filter((t) => t.id !== currentTrack.id)
          : [...context.slice(i + 1), ...context.slice(0, i)];
      refill.forEach((t) => autoQueued.add(t.id));
      set({ queue: refill });
      return Promise.resolve();
    }

    // A repeated single track replays rather than moving on to similar ones.
    if (repeat !== 'off') return Promise.resolve();

    if (!autoplayRequest) {
      const seedId = currentTrack.id;
      const exclude = [seedId, ...history.map((t) => t.id)];
      autoplayRequest = getAutoplayTracks(seedId, exclude)
        .then((tracks) => {
          const state = get();
          if (state.currentTrack?.id !== seedId || state.context || state.queue.length > 0) return;
          const playable = tracks.filter(hasAudio);
          playable.forEach((t) => autoQueued.add(t.id));
          set({ queue: playable });
        })
        .catch(() => {})
        .finally(() => {
          autoplayRequest = null;
        });
    }
    return autoplayRequest;
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

  restartCurrent: () => {
    set({ restartTick: get().restartTick + 1, isPlaying: true, progress: 0 });
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
