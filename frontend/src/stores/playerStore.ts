import { create } from 'zustand';
import type { Track, LyricsLine } from '@/types';
import type { Device } from '@/api/devices';
import { registerDevice, sendHeartbeat, getDevices } from '@/api/devices';
import { getAutoplayTracks } from '@/api/recommendations';
import { t } from '@/i18n';
import { useToastStore } from '@/stores/toastStore';

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

// Clicking a track without audio used to do nothing at all.
const reportNoAudio = () => useToastStore.getState().addToast(t('player.no_audio'));

// Ids the player queued by itself (rest of the playlist, autoplay), as opposed
// to tracks the user added: those stay ahead and survive a new selection.
const autoQueued = new Set<string>();
let autoplayRequest: Promise<void> | null = null;

// Shuffle reorders the queue itself (Fisher-Yates) so the queue panel shows
// the real play order and the preloaded track is the one that will play.
function shuffled<T>(tracks: T[]): T[] {
  const copy = [...tracks];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  // Playlist/album the user is listening from; refills the queue when it runs out.
  context: Track[] | null;
  history: Track[];
  // What the current queue already played: "repeat all" replays it once empty.
  queuePlayed: Track[];
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
  queuePlayed: [],
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
    if (!hasAudio(track)) {
      reportNoAudio();
      return;
    }
    const { currentTrack, history, queue } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    // Played on its own: drop what the previous playlist/autoplay queued.
    const userQueue = queue.filter((t) => !autoQueued.has(t.id) && t.id !== track.id);
    autoQueued.clear();
    set({ currentTrack: track, queue: userQueue, context: null, queuePlayed: [], isPlaying: true, progress: 0 });
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
    const { queue, currentTrack, history } = get();
    const queued = preferred && queue.find((t) => t.id === preferred.id);
    // The queue order is the play order: enabling shuffle shuffles the queue
    // itself (see toggleShuffle), so the panel, the preload and the track
    // that actually plays next always agree.
    const nextTrack = queued ? queued : queue[0]!;
    const newQueue = queue.filter((t) => t.id !== nextTrack.id);
    autoQueued.delete(nextTrack.id);
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
      // Remember what left the queue so "repeat all" can play it again.
      if (get().repeat === 'all' && !get().context) {
        set({ queuePlayed: [...get().queuePlayed, currentTrack] });
      }
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
    if (playable.length === 0) {
      reportNoAudio();
      return;
    }
    const { currentTrack, history } = get();
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
    }
    // The clicked track, or the next playable one if it has no audio.
    const trackToPlay = tracks.slice(startIndex).find(hasAudio) ?? playable[0]!;
    const rest = playable.slice(playable.indexOf(trackToPlay) + 1);
    const queueTracks = get().shuffle ? shuffled(rest) : rest;
    autoQueued.clear();
    queueTracks.forEach((t) => autoQueued.add(t.id));
    set({
      currentTrack: trackToPlay,
      queue: queueTracks,
      context: playable,
      queuePlayed: [],
      isPlaying: true,
      progress: 0,
    });
    void get().refillQueue();
  },

  refillQueue: () => {
    const { queue, currentTrack, context, repeat, queuePlayed, history, shuffle } = get();
    if (queue.length > 0 || !currentTrack) return Promise.resolve();
    const inPlayOrder = (tracks: Track[]) => (shuffle ? shuffled(tracks) : tracks);

    if (context && context.length > 1) {
      // Level 1 of the loop button: replay the playlist from the top.
      if (repeat !== 'all') return Promise.resolve();
      // The tracks after this one, then from the top.
      const i = context.findIndex((t) => t.id === currentTrack.id);
      const ordered =
        i === -1
          ? context.filter((t) => t.id !== currentTrack.id)
          : [...context.slice(i + 1), ...context.slice(0, i)];
      const refill = inPlayOrder(ordered);
      refill.forEach((t) => autoQueued.add(t.id));
      set({ queue: refill });
      return Promise.resolve();
    }

    if (repeat === 'all') {
      // Same level, without a playlist: replay what this queue already played.
      const refill = inPlayOrder(queuePlayed.filter((t) => t.id !== currentTrack.id));
      if (refill.length > 0) set({ queue: refill, queuePlayed: [] });
      return Promise.resolve();
    }

    // "Repeat one" restarts the track, so autoplay only serves manual skips.
    if (!autoplayRequest) {
      const seedId = currentTrack.id;
      const exclude = [seedId, ...history.map((t) => t.id)];
      autoplayRequest = getAutoplayTracks(seedId, exclude)
        .then((tracks) => {
          const state = get();
          if (state.currentTrack?.id !== seedId || state.context || state.queue.length > 0) return;
          const playable = tracks.filter(hasAudio);
          const queued = state.shuffle ? shuffled(playable) : playable;
          queued.forEach((t) => autoQueued.add(t.id));
          set({ queue: queued });
        })
        .catch(() => {})
        .finally(() => {
          autoplayRequest = null;
        });
    }
    return autoplayRequest;
  },

  toggleShuffle: () => {
    const { shuffle, queue, context, currentTrack } = get();
    if (!shuffle) {
      // Turning on: shuffle what the player queued, keeping the user's own
      // picks (at the front) in order so "play next" stays predictable.
      const firstAuto = queue.findIndex((t) => autoQueued.has(t.id));
      const at = firstAuto === -1 ? queue.length : firstAuto;
      set({ shuffle: true, queue: [...queue.slice(0, at), ...shuffled(queue.slice(at))] });
      return;
    }
    // Turning off with a playlist context: back to the playlist order.
    if (context && currentTrack) {
      const userTracks = queue.filter((t) => !autoQueued.has(t.id));
      const userIds = new Set(userTracks.map((t) => t.id));
      const i = context.findIndex((t) => t.id === currentTrack.id);
      const after =
        i === -1
          ? context.filter((t) => t.id !== currentTrack.id)
          : [...context.slice(i + 1), ...context.slice(0, i)];
      const rest = after.filter((t) => t.id !== currentTrack.id && !userIds.has(t.id));
      autoQueued.clear();
      rest.forEach((t) => autoQueued.add(t.id));
      set({ shuffle: false, queue: [...userTracks, ...rest] });
      return;
    }
    set({ shuffle: false });
  },

  toggleRepeat: () => {
    const { repeat } = get();
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeat) + 1) % modes.length]!;
    // Leaving the queue loop forgets what it had played.
    set({ repeat: nextMode, ...(nextMode === 'all' ? {} : { queuePlayed: [] }) });
    // Turning the loop on with an empty queue: refill right away so the
    // queue panel immediately shows what will play next.
    if (nextMode === 'all') void get().refillQueue();
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
