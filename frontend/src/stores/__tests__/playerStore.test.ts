import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerStore } from '../playerStore';
import { getAutoplayTracks } from '@/api/recommendations';
import type { Track } from '@/types';

vi.mock('@/api/recommendations', () => ({
  getAutoplayTracks: vi.fn(),
}));

const mockAutoplay = vi.mocked(getAutoplayTracks);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const createTrack = (id: string, title = 'Test Track'): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  file_url: 'local:/test/file.flac',
  duration_seconds: 180,
  play_count: 0,
  is_explicit: false,
  created_at: '2024-01-01',
});

beforeEach(() => {
  mockAutoplay.mockReset();
  mockAutoplay.mockResolvedValue([]);
  usePlayerStore.setState({
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
    useHls: false,
    lyrics: [],
    showLyrics: false,
    crossfadeDuration: 0,
    replayGainEnabled: true,
    offlineTracks: new Map(),
  });
});

describe('playerStore', () => {
  it('has correct initial state', () => {
    const state = usePlayerStore.getState();
    expect(state.currentTrack).toBeNull();
    expect(state.queue).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.isPlaying).toBe(false);
    expect(state.volume).toBe(0.7);
    expect(state.progress).toBe(0);
    expect(state.shuffle).toBe(false);
    expect(state.repeat).toBe('off');
  });

  it('setTrack updates current track and plays', () => {
    const track = createTrack('1', 'My Song');
    usePlayerStore.getState().setTrack(track);

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(track);
    expect(state.isPlaying).toBe(true);
    expect(state.progress).toBe(0);
  });

  it('setTrack adds previous track to history', () => {
    const track1 = createTrack('1', 'Song 1');
    const track2 = createTrack('2', 'Song 2');
    usePlayerStore.getState().setTrack(track1);
    usePlayerStore.getState().setTrack(track2);

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(track2);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toEqual(track1);
  });

  it('togglePlay toggles isPlaying', () => {
    usePlayerStore.getState().setTrack(createTrack('1'));
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('next plays next track from queue', () => {
    const track1 = createTrack('1');
    const track2 = createTrack('2');
    usePlayerStore.getState().setTrack(track1);
    usePlayerStore.getState().addToQueue(track2);

    usePlayerStore.getState().next();

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(track2);
    expect(state.queue).toEqual([]);
    expect(state.isPlaying).toBe(true);
  });

  it('next advances to the preferred queued track (preloaded by the crossfade)', () => {
    const [track1, track2, track3] = [createTrack('1'), createTrack('2'), createTrack('3')];
    usePlayerStore.getState().setTrack(track1);
    usePlayerStore.getState().addToQueue(track2);
    usePlayerStore.getState().addToQueue(track3);

    usePlayerStore.getState().next(track3);

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(track3);
    expect(state.queue).toEqual([track2]);
  });

  it('next ignores a preferred track that is not queued', () => {
    const [track1, track2] = [createTrack('1'), createTrack('2')];
    usePlayerStore.getState().setTrack(track1);
    usePlayerStore.getState().addToQueue(track2);

    usePlayerStore.getState().next(createTrack('99'));

    expect(usePlayerStore.getState().currentTrack).toEqual(track2);
  });

  it('next with empty queue and no similar tracks stops playing', async () => {
    usePlayerStore.getState().setTrack(createTrack('1'));
    await flush();

    usePlayerStore.getState().next();
    await flush();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('prev goes to history', () => {
    const track1 = createTrack('1');
    const track2 = createTrack('2');
    usePlayerStore.getState().setTrack(track1);
    usePlayerStore.getState().setTrack(track2);

    usePlayerStore.getState().prev();

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(track1);
    expect(state.history).toHaveLength(0);
    expect(state.isPlaying).toBe(true);
  });

  it('prev with empty history does nothing', () => {
    const track = createTrack('2');
    usePlayerStore.getState().setTrack(track);
    usePlayerStore.getState().history = [];

    usePlayerStore.getState().prev();

    expect(usePlayerStore.getState().currentTrack?.id).toBe('2');
  });

  it('addToQueue adds track', () => {
    const track = createTrack('1');
    usePlayerStore.getState().addToQueue(track);

    expect(usePlayerStore.getState().queue).toEqual([track]);
  });

  it('removeFromQueue removes track', () => {
    const track1 = createTrack('1');
    const track2 = createTrack('2');
    usePlayerStore.getState().addToQueue(track1);
    usePlayerStore.getState().addToQueue(track2);

    usePlayerStore.getState().removeFromQueue('1' as any);

    expect(usePlayerStore.getState().queue).toHaveLength(1);
    expect(usePlayerStore.getState().queue[0]).toEqual(track2);
  });

  it('toggleShuffle toggles shuffle', () => {
    expect(usePlayerStore.getState().shuffle).toBe(false);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(true);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(false);
  });

  it('toggleRepeat cycles modes off -> all -> one -> off', () => {
    expect(usePlayerStore.getState().repeat).toBe('off');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('all');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('one');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('off');
  });

  it('setVolume clamps 0-1', () => {
    usePlayerStore.getState().setVolume(1.5);
    expect(usePlayerStore.getState().volume).toBe(1);

    usePlayerStore.getState().setVolume(-0.5);
    expect(usePlayerStore.getState().volume).toBe(0);

    usePlayerStore.getState().setVolume(0.5);
    expect(usePlayerStore.getState().volume).toBe(0.5);
  });

  it('seek updates progress', () => {
    usePlayerStore.getState().seek(42);
    expect(usePlayerStore.getState().progress).toBe(42);
  });

  it('next with repeat all replays current track when queue is empty', () => {
    const track = createTrack('1');
    usePlayerStore.getState().setTrack(track);
    usePlayerStore.getState().repeat = 'all';

    usePlayerStore.getState().next();

    expect(usePlayerStore.getState().currentTrack).toEqual(track);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('setPlaylistAsQueue queues the tracks after the clicked one', () => {
    const tracks = ['1', '2', '3', '4'].map((id) => createTrack(id));

    usePlayerStore.getState().setPlaylistAsQueue(tracks, 2);

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('3');
    expect(state.queue.map((t) => t.id)).toEqual(['4']);
  });

  it('setPlaylistAsQueue skips tracks without audio', () => {
    const silent = { ...createTrack('2'), file_url: undefined };
    const tracks = [createTrack('1'), silent, createTrack('3')];

    usePlayerStore.getState().setPlaylistAsQueue(tracks, 1);

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('3');
    expect(state.queue.map((t) => t.id)).toEqual(['1']);
  });

  it('refills the queue from the playlist once it runs out', () => {
    const tracks = ['1', '2', '3'].map((id) => createTrack(id));
    usePlayerStore.getState().setPlaylistAsQueue(tracks, 1);

    usePlayerStore.getState().next(); // -> 3, end of the playlist

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('3');
    expect(state.queue.map((t) => t.id)).toEqual(['1', '2']);
    expect(mockAutoplay).not.toHaveBeenCalled();
  });

  it('queues similar tracks after a track played outside a playlist', async () => {
    const similar = [createTrack('s1'), createTrack('s2')];
    mockAutoplay.mockResolvedValue(similar);

    usePlayerStore.getState().setTrack(createTrack('1'));
    await flush();

    expect(mockAutoplay).toHaveBeenCalledWith('1', ['1']);
    expect(usePlayerStore.getState().queue).toEqual(similar);

    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().currentTrack?.id).toBe('s1');
  });

  it('next waits for similar tracks when the queue is empty', async () => {
    usePlayerStore.getState().setTrack(createTrack('1'));
    await flush();
    mockAutoplay.mockResolvedValue([createTrack('s1')]);

    usePlayerStore.getState().next();
    await flush();

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('s1');
    expect(state.isPlaying).toBe(true);
  });

  it('user-queued tracks play before the rest of the playlist', () => {
    const tracks = ['1', '2', '3'].map((id) => createTrack(id));
    usePlayerStore.getState().setPlaylistAsQueue(tracks, 0);

    usePlayerStore.getState().addToQueue(createTrack('mine'));

    expect(usePlayerStore.getState().queue.map((t) => t.id)).toEqual(['mine', '2', '3']);
  });

  it('playing a single track drops the previous playlist but keeps user picks', () => {
    const tracks = ['1', '2', '3'].map((id) => createTrack(id));
    usePlayerStore.getState().setPlaylistAsQueue(tracks, 0);
    usePlayerStore.getState().addToQueue(createTrack('mine'));

    usePlayerStore.getState().setTrack(createTrack('solo'));

    const state = usePlayerStore.getState();
    expect(state.context).toBeNull();
    expect(state.queue.map((t) => t.id)).toEqual(['mine']);
  });
});

describe('tracks without audio', () => {
  it('tells the user instead of silently doing nothing', async () => {
    const { useToastStore } = await import('../toastStore');
    useToastStore.setState({ toasts: [] });
    const silent = { ...createTrack('silent'), file_url: undefined, hls_path: undefined } as Track;

    usePlayerStore.getState().setTrack(silent);
    usePlayerStore.getState().setPlaylistAsQueue([silent], 0);

    expect(usePlayerStore.getState().currentTrack).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });
});
