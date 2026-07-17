import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../playerStore';
import type { Track } from '@/types';

const createTrack = (id: string, title = 'Test Track'): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  file_url: 'local:/test/file.flac',
  duration_seconds: 180,
  play_count: 0,
  created_at: '2024-01-01',
});

beforeEach(() => {
  usePlayerStore.setState({
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

  it('next with empty queue stops playing', () => {
    usePlayerStore.getState().setTrack(createTrack('1'));

    usePlayerStore.getState().next();

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
});
