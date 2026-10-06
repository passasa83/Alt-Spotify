import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJamStore } from '../jamStore';
import { usePlayerStore } from '../playerStore';
import { useAuthStore } from '../authStore';
import { connectJamWebSocket } from '@/api/jam';

vi.mock('@/api/jam', () => ({
  createJamSession: vi.fn(),
  joinJamSession: vi.fn(),
  leaveJamSession: vi.fn(),
  getJamSession: vi.fn(),
  connectJamWebSocket: vi.fn(),
}));

const track = (id: string, title: string) => ({
  id,
  title,
  artist_id: 'a1',
  duration_seconds: 180,
  file_url: `local:/music/${id}.mp3`,
  play_count: 0,
  is_explicit: false,
  created_at: '2024-01-01',
});

const makeSocket = () => {
  const socket = {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    onopen: null as ((e: unknown) => void) | null,
    onmessage: null as ((e: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  vi.mocked(connectJamWebSocket).mockReturnValue(socket as unknown as WebSocket);
  return socket;
};

beforeEach(() => {
  vi.clearAllMocks();
  useJamStore.setState({
    currentSession: null,
    messages: [],
    participants: [],
    isConnected: false,
    votes: [],
    ws: null,
    lastSyncedTrackId: null,
  });
  usePlayerStore.setState({ currentTrack: null, queue: [], context: null, isPlaying: false });
  useAuthStore.setState({ user: { id: 'me', email: 'me@x.com', pseudo: 'Me', role: 'USER', is_active: true, is_child_account: false, created_at: '' } as never });
});

describe('jamStore track sync', () => {
  it('plays the track received from another participant', () => {
    const socket = makeSocket();
    useJamStore.getState().connectWebSocket('session-1');

    socket.onmessage!({
      data: JSON.stringify({ type: 'track_changed', user_id: 'other', data: { track: track('t1', 'Jam Song'), queue: [] } }),
    });

    expect(usePlayerStore.getState().currentTrack?.id).toBe('t1');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(useJamStore.getState().lastSyncedTrackId).toBe('t1');
  });

  it('ignores its own echo', () => {
    const socket = makeSocket();
    useJamStore.getState().connectWebSocket('session-1');

    socket.onmessage!({
      data: JSON.stringify({ type: 'track_changed', user_id: 'me', data: { track: track('t9', 'Mine'), queue: [] } }),
    });

    expect(usePlayerStore.getState().currentTrack).toBeNull();
  });

  it('sends track changes with the queue and marks them synced', () => {
    const socket = makeSocket();
    useJamStore.getState().connectWebSocket('session-1');

    useJamStore.getState().sendTrackChange(track('t2', 'Mine') as never, [track('t3', 'Next') as never]);

    expect(socket.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(socket.send.mock.calls[0][0]);
    expect(sent.type).toBe('track_changed');
    expect(sent.data.track.id).toBe('t2');
    expect(sent.data.queue.map((t: { id: string }) => t.id)).toEqual(['t3']);
    expect(useJamStore.getState().lastSyncedTrackId).toBe('t2');
  });

  it('survives the bare participant_joined broadcast', async () => {
    const socket = makeSocket();
    useJamStore.setState({
      currentSession: { id: 'session-1', participants: [] } as never,
      participants: [],
    });
    useJamStore.getState().connectWebSocket('session-1');

    expect(() =>
      socket.onmessage!({ data: JSON.stringify({ type: 'participant_joined', user_id: 'newcomer' }) }),
    ).not.toThrow();
  });
});
