import { create } from 'zustand';
import type { JamSession, JamParticipant, Track } from '@/types';
import { createJamSession, joinJamSession, leaveJamSession, getJamSession, connectJamWebSocket } from '@/api/jam';

interface JamState {
  currentSession: JamSession | null;
  messages: any[];
  participants: JamParticipant[];
  isConnected: boolean;
  votes: { trackId: number; voters: number[] }[];
  ws: WebSocket | null;
  createSession: () => Promise<void>;
  joinSession: (code: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  sendTrackChange: (track: Track) => void;
  sendVoteSkip: (trackId: number) => void;
  sendChat: (message: string) => void;
  connectWebSocket: (sessionId: string) => void;
  disconnectWebSocket: () => void;
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
      set({ currentSession: null, messages: [], participants: [], votes: [] });
    }
  },

  loadSession: async (sessionId: string) => {
    const session = await getJamSession(sessionId);
    set({ currentSession: session, participants: session.participants });
  },

  sendTrackChange: (track: Track) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'track_changed', data: { track } }));
    }
  },

  sendVoteSkip: (trackId: number) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'vote_skip', data: { track_id: trackId } }));
    }
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
        case 'track_changed':
          set({ messages: [...state.messages, message] });
          break;
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
        case 'participant_joined':
          set({
            participants: [...state.participants, message.data.participant],
            messages: [...state.messages, message],
          });
          break;
        case 'participant_left':
          set({
            participants: state.participants.filter(
              (p) => p.user_id !== message.data.user_id
            ),
            messages: [...state.messages, message],
          });
          break;
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
