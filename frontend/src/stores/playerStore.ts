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

// The queue panel always shows what comes next: never fewer than this many
// tracks stay queued (looped playlist → playlist tracks, otherwise similar ones).
export const MIN_QUEUE_LENGTH = 10;
// How many similar tracks a single autoplay request pulls (the API caps at 30).
export const AUTOPLAY_FETCH_LIMIT = 25;

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  /** Ids of the queued tracks the player added by itself (loop, autoplay). */
  autoQueuedIds: string[];
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
  /** Programmatic seek request (jam catch-up): consumed by the Player. */
  seekTarget: number | null;
  seekTick: number;
  seekTo: (time: number) => void;
  /** A play() blocked by the browser autoplay policy: show a resume CTA. */
  playBlocked: boolean;
  setPlayBlocked: (blocked: boolean) => void;
  offlineTracks: Map<string, Blob>;  deviceId: string;
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
  // Below MIN_QUEUE_LENGTH: loop the context, or queue similar tracks without one.
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
  autoQueuedIds: [],
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
  seekTarget: null,
  seekTick: 0,
  playBlocked: false,
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
    set({ currentTrack: track, queue: userQueue, autoQueuedIds: [], context: null, queuePlayed: [], isPlaying: true, progress: 0 });
    void get().refillQueue();
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  seekTo: (time: number) => set((s) => ({ progress: Math.max(0, time), seekTarget: Math.max(0, time), seekTick: s.seekTick + 1 })),
  setPlayBlocked: (blocked: boolean) => set({ playBlocked: blocked }),

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
    // Remove a single occurrence: looped playlists queue the same track twice.
    const preferredAt = preferred ? queue.findIndex((t) => t.id === preferred.id) : -1;
    const at = preferredAt !== -1
      ? preferredAt
      : shuffle
        ? Math.floor(Math.random() * queue.length)
        : 0;
    const nextTrack = queue[at]!;
    const newQueue = [...queue.slice(0, at), ...queue.slice(at + 1)];
    // A looped playlist queues the same track several times: only forget the
    // id once its last copy left the queue.
    if (!newQueue.some((t) => t.id === nextTrack.id)) autoQueued.delete(nextTrack.id);
    if (currentTrack) {
      set({ history: [currentTrack, ...history].slice(0, 50) });
      // Remember what left the queue so "repeat all" can play it again.
      if (get().repeat === 'all' && !get().context) {
        set({ queuePlayed: [...get().queuePlayed, currentTrack] });
      }
    }
    set({ currentTrack: nextTrack, queue: newQueue, autoQueuedIds: [...autoQueued], isPlaying: true, progress: 0 });
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
    autoQueued.delete(trackId);
    set({ queue: queue.filter((t) => t.id !== trackId), autoQueuedIds: [...autoQueued] });
  },

  clearQueue: () => {
    autoQueued.clear();
    set({ queue: [], autoQueuedIds: [] });
  },

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
    const queueTracks = playable.slice(playable.indexOf(trackToPlay) + 1);
    autoQueued.clear();
    queueTracks.forEach((t) => autoQueued.add(t.id));
    set({
      currentTrack: trackToPlay,
      queue: queueTracks,
      autoQueuedIds: queueTracks.map((t) => t.id),
      context: playable,
      queuePlayed: [],
      isPlaying: true,
      progress: 0,
    });
    void get().refillQueue();
  },

  refillQueue: () => {
    const { queue, currentTrack, context, repeat, queuePlayed, history } = get();
    if (!currentTrack || queue.length >= MIN_QUEUE_LENGTH) return Promise.resolve();

    if (context && context.length > 0 && repeat === 'all') {
      // Looped playlist: extend the queue with the playlist rotation, cycled
      // so that at least MIN_QUEUE_LENGTH tracks stay queued. User picks stay
      // ahead and the rotation continues after the tail of the queue.
      const i = context.findIndex((t) => t.id === currentTrack.id);
      const fullLoop =
        i === -1
          ? context.filter((t) => t.id !== currentTrack.id)
          : [...context.slice(i + 1), ...context.slice(0, i), currentTrack];
      const anchorId = queue.length > 0 ? queue[queue.length - 1]!.id : currentTrack.id;
      const ai = fullLoop.findIndex((t) => t.id === anchorId);
      const rotation = ai === -1 ? [...fullLoop] : [...fullLoop.slice(ai + 1), ...fullLoop.slice(0, ai + 1)];
      const refill = [...queue];
      for (let loop = 0; loop < MIN_QUEUE_LENGTH && refill.length < MIN_QUEUE_LENGTH; loop++) {
        for (const t of rotation) {
          if (refill.length >= MIN_QUEUE_LENGTH) break;
          refill.push(t);
          autoQueued.add(t.id);
        }
        if (rotation.length === 0) break;
      }
      set({ queue: refill, autoQueuedIds: [...autoQueued] });
      return Promise.resolve();
    }

    if (!context && repeat === 'all') {
      // Same level, without a playlist: replay what this queue already played.
      const played = queuePlayed.filter((t) => t.id !== currentTrack.id);
      if (played.length === 0 && queue.length === 0) return Promise.resolve();
      const refill = [...queue];
      for (let loop = 0; loop < MIN_QUEUE_LENGTH && refill.length < MIN_QUEUE_LENGTH; loop++) {
        for (const t of played) {
          if (refill.length >= MIN_QUEUE_LENGTH) break;
          refill.push(t);
          autoQueued.add(t.id);
        }
        if (played.length === 0) break;
      }
      set({ queue: refill, queuePlayed: [], autoQueuedIds: [...autoQueued] });
      return Promise.resolve();
    }

    // Anything else (single track, playlist not looped, drained playlist):
    // similar tracks keep the queue at MIN_QUEUE_LENGTH and beyond.
    // "Repeat one" restarts the track, so autoplay only serves manual skips.
    if (!autoplayRequest) {
      const seedId = currentTrack.id;
      const seedContext = context;
      const seedRepeat = repeat;
      const exclude = [seedId, ...history.map((t) => t.id), ...queue.map((t) => t.id)];
      autoplayRequest = getAutoplayTracks(seedId, exclude, AUTOPLAY_FETCH_LIMIT)
        .then((tracks) => {
          const state = get();
          if (
            state.currentTrack?.id !== seedId ||
            state.context !== seedContext ||
            state.repeat !== seedRepeat ||
            (state.context && state.repeat === 'all')
          )
            return;
          const fresh = tracks
            .filter(hasAudio)
            .filter((t) => t.id !== seedId && !state.queue.some((q) => q.id === t.id));
          if (fresh.length === 0) return;
          fresh.forEach((t) => autoQueued.add(t.id));
          set({ queue: [...state.queue, ...fresh], autoQueuedIds: [...autoQueued] });
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
    const nextMode = modes[(modes.indexOf(repeat) + 1) % modes.length]!;
    // Leaving the queue loop forgets what it had played.
    set({ repeat: nextMode, ...(nextMode === 'all' ? {} : { queuePlayed: [] }) });
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
