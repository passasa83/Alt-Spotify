import { create } from 'zustand';
import type { JamSession, JamParticipant, Track } from '@/types';
import { createJamSession, joinJamSession, leaveJamSession, getJamSession, connectJamWebSocket, getJamNowPlaying } from '@/api/jam';
import { getTrack } from '@/api/tracks';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';

interface JamState {
  currentSession: JamSession | null;
  messages: any[];
  participants: JamParticipant[];
  isConnected: boolean;
  votes: { trackId: string; voters: number[] }[];
  ws: WebSocket | null;
  /** Last track sent to (or applied from) the jam: echo + loop guard. */
  lastSyncedTrackId: string | null;
  createSession: () => Promise<void>;
  joinSession: (code: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  sendTrackChange: (track: Track, queue?: Track[]) => void;
  sendPosition: (trackId: string, positionMs: number) => void;
  sendPlaybackState: (isPlaying: boolean, trackId?: string) => void;
  sendVoteSkip: (trackId: string) => void;
  sendChat: (message: string) => void;
  connectWebSocket: (sessionId: string) => void;
  disconnectWebSocket: () => void;
  /** Guest joining mid-song: jump to the live track and position. */
  syncToLive: () => Promise<void>;
}

export const useJamStore = create<JamState>((set, get) => ({
  currentSession: null,
  messages: [],
  participants: [],
  isConnected: false,
  votes: [],
  ws: null,

  createSession: async () => {
    const session = await createJamSession();
    set({ currentSession: session, participants: session.participants });
  },

  joinSession: async (code: string) => {
    const session = await joinJamSession(code);
    set({ currentSession: session, participants: session.participants });
  },

  leaveSession: async () => {
    const { currentSession } = get();
    if (currentSession) {
      await leaveJamSession(currentSession.id);
      get().disconnectWebSocket();
      set({ currentSession: null, messages: [], participants: [], votes: [], lastSyncedTrackId: null });
    }
  },

  loadSession: async (sessionId: string) => {
    const session = await getJamSession(sessionId);
    set({ currentSession: session, participants: session.participants });
  },

  sendTrackChange: (track: Track, queue: Track[] = []) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'track_changed', data: { track, queue } }));
      set({ lastSyncedTrackId: track.id });
    }
  },

  sendVoteSkip: (trackId: string) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'vote_skip', data: { track_id: trackId } }));
    }
  },

  sendPosition: (trackId: string, positionMs: number) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'position_update', data: { track_id: trackId, position_ms: Math.max(0, Math.floor(positionMs)) } }));
    }
  },

  sendPlaybackState: (isPlaying: boolean, trackId?: string) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'playback_state', data: { is_playing: isPlaying, track_id: trackId } }));
    }
  },

  syncToLive: async () => {
    const { currentSession } = get();
    if (!currentSession) return;
    const live = await getJamNowPlaying(currentSession.id).catch(() => null);
    if (!live?.track_id) return;
    const player = usePlayerStore.getState();
    // The stored position is from updated_at: move it forward while playing.
    const elapsed = live.is_playing ? Math.max(0, Date.now() / 1000 - live.updated_at) : 0;
    const position = Math.max(0, live.position_ms / 1000 + elapsed);
    if (player.currentTrack?.id === live.track_id) {
      // Same track, drifted behind (or ahead): re-align past 3 s of drift.
      if (Math.abs(player.progress - position) > 3) player.seekTo(position);
      if (!live.is_playing && player.isPlaying) player.pause();
      else if (live.is_playing && !player.isPlaying) player.play();
      return;
    }
    const track = await getTrack(live.track_id).catch(() => null);
    if (!track) return;
    set({ lastSyncedTrackId: live.track_id });
    player.setPlaylistAsQueue([track], 0);
    player.seekTo(position);
    if (!live.is_playing) player.pause();
  },

  sendChat: (message: string) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', data: { message } }));
    }
  },

  connectWebSocket: (sessionId: string) => {
    const { ws: existingWs } = get();
    if (existingWs) {
      existingWs.close();
    }

    const socket = connectJamWebSocket(sessionId);

    socket.onopen = () => {
      set({ isConnected: true });
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const state = get();

      switch (message.type) {
        case 'track_changed': {
          // Play what the jam just started: the sender's own echo (the relay
          // forwards to every subscriber) and replays are ignored.
          const track = message.data?.track as Track | undefined;
          if (!track?.id) break;
          const myId = useAuthStore.getState().user?.id;
          if (message.user_id && myId && message.user_id === myId) break;
          if (track.id === state.lastSyncedTrackId) break;
          const rest = Array.isArray(message.data?.queue)
            ? (message.data.queue as Track[]).filter((t) => t?.id !== track.id)
            : [];
          set({ lastSyncedTrackId: track.id, messages: [...state.messages, message] });
          usePlayerStore.getState().setPlaylistAsQueue([track, ...rest], 0);
          break;
        }
        case 'queue_updated':
          if (state.currentSession) {
            set({
              currentSession: {
                ...state.currentSession,
                queue: message.data.queue,
              },
              messages: [...state.messages, message],
            });
          }
          break;
        case 'vote_skip':
          set({ messages: [...state.messages, message] });
          break;
        case 'track_skipped':
          // Enough votes: everybody moves on, like a manual next.
          set({ messages: [...state.messages, message] });
          usePlayerStore.getState().next();
          break;
        case 'vote_update':
          set({ messages: [...state.messages, message] });
          break;
        case 'playback_state': {
          // Pause / resume follows the jam; guard on actual change so the
          // applied state is not re-broadcast in a loop.
          const playing = message.data?.is_playing;
          if (typeof playing !== 'boolean') break;
          const player = usePlayerStore.getState();
          if (!player.currentTrack) break;
          if (playing && !player.isPlaying) player.play();
          else if (!playing && player.isPlaying) player.pause();
          break;
        }
        case 'participant_joined': {
          // The join broadcast carries a bare user_id (no participant object).
          const joined = message.data?.participant as JamParticipant | undefined;
          if (joined) {
            set({
              participants: [...state.participants.filter((p) => p.user_id !== joined.user_id), joined],
              messages: [...state.messages, message],
            });
          } else if (state.currentSession) {
            // Refresh the roster from the API instead of crashing on undefined.
            void get()
              .loadSession(state.currentSession.id)
              .catch(() => {});
            set({ messages: [...state.messages, message] });
          }
          break;
        }
        case 'participant_left': {
          const leftId = message.user_id ?? message.data?.user_id;
          set({
            participants: state.participants.filter((p) => p.user_id !== leftId),
            messages: [...state.messages, message],
          });
          break;
        }
        case 'chat':
          set({ messages: [...state.messages, message] });
          break;
      }
    };

    socket.onclose = () => {
      set({ isConnected: false, ws: null });
    };

    socket.onerror = () => {
      set({ isConnected: false });
    };

    set({ ws: socket });
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false });
    }
  },
}));
