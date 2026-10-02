import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useToastStore } from '@/stores/toastStore';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Player from '../Player';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';

vi.mock('@/stores/playerStore');
const playTrackMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/api/tracks', () => ({
  playTrack: (...args: unknown[]) => playTrackMock(...args),
  getTrackStreamUrl: (id: string) => `/api/v1/tracks/${id}/stream`,
  getHlsStreamUrl: (id: string) => `/api/v1/stream/${id}/master.m3u8`,
  resolveCoverUrl: (url: string | null | undefined) => url || '/placeholder-album.svg',
}));
vi.mock('@/components/SynchronizedLyrics', () => ({
  default: () => <div data-testid="lyrics">Lyrics</div>,
}));
vi.mock('@/components/DownloadButton', () => ({
  default: () => <div data-testid="download-btn">Download</div>,
  useTrackDownload: () => ({ downloaded: false, isDownloading: false, toggle: vi.fn() }),
}));
vi.mock('@/components/Equalizer', () => ({
  default: () => <div data-testid="equalizer">Equalizer</div>,
}));

const createTrack = (id: string, title = 'Test Track'): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  duration_seconds: 180,
  play_count: 0,
  is_explicit: false,
  created_at: '2024-01-01',
  artist: { id: 'artist-1', name: 'Test Artist', created_at: '2024-01-01' },
});

const defaultPlayerState = {
  currentTrack: null,
  isPlaying: false,
  volume: 0.7,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  queue: [],
  lyrics: [],
  showLyrics: false,
  crossfadeDuration: 0,
  replayGainEnabled: true,
  playbackRate: 1,
  togglePlay: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  setVolume: vi.fn(),
  seek: vi.fn(),
  setDuration: vi.fn(),
  toggleShuffle: vi.fn(),
  toggleRepeat: vi.fn(),
  toggleLyrics: vi.fn(),
  setCrossfadeDuration: vi.fn(),
  toggleReplayGain: vi.fn(),
  setPlaybackRate: vi.fn(),
};

beforeEach(() => {
  const state = { ...defaultPlayerState };
  vi.mocked(usePlayerStore).mockReturnValue(state as any);
  (usePlayerStore as any).getState = () => state;
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  Object.defineProperty(window.HTMLMediaElement.prototype, 'src', { writable: true, value: '' });
});

describe('Player', () => {
  it('renders no track state', () => {
    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );
    expect(screen.getByText('Select a track to play')).toBeInTheDocument();
  });

  it('renders current track info', () => {
    const track = createTrack('1', 'My Song');
    vi.mocked(usePlayerStore).mockReturnValue({
      ...defaultPlayerState,
      currentTrack: track,
    } as any);

    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );
    expect(screen.getByText('My Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('play/pause button calls togglePlay', async () => {
    const togglePlay = vi.fn();
    vi.mocked(usePlayerStore).mockReturnValue({
      ...defaultPlayerState,
      currentTrack: createTrack('1'),
      isPlaying: false,
      togglePlay,
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );

    const playPauseButton = screen.getAllByRole('button').find(btn =>
      btn.className.includes('rounded-full bg-white')
    );
    await user.click(playPauseButton!);

    expect(togglePlay).toHaveBeenCalled();
  });

  it('reports a missing audio file and skips to the next track', async () => {
    const next = vi.fn();
    const state = {
      ...defaultPlayerState,
      currentTrack: createTrack('1', 'Broken Song'),
      isPlaying: true,
      useHls: false,
      next,
      pause: vi.fn(),
    };
    vi.mocked(usePlayerStore).mockReturnValue(state as any);
    (usePlayerStore as any).getState = () => state;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }));
    const created: HTMLAudioElement[] = [];
    const RealAudio = window.Audio;
    vi.stubGlobal(
      'Audio',
      class extends RealAudio {
        constructor() {
          super();
          created.push(this);
        }
      },
    );

    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );

    const audio = created[0]!;
    audio.setAttribute('src', '/api/v1/tracks/1/stream');
    Object.defineProperty(audio, 'error', { value: { code: 4 } });
    audio.dispatchEvent(new Event('error'));

    await waitFor(() => expect(next).toHaveBeenCalled());
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
      'Audio file not found: Broken Song',
    );

    vi.unstubAllGlobals();
  });

  it('records the time really listened when the track ends, ignoring seeks', async () => {
    playTrackMock.mockClear();
    const state = { ...defaultPlayerState, currentTrack: createTrack('42', 'Counted'), isPlaying: true, useHls: false, restartCurrent: vi.fn() };
    vi.mocked(usePlayerStore).mockReturnValue(state as any);
    (usePlayerStore as any).getState = () => state;
    const created: HTMLAudioElement[] = [];
    const RealAudio = window.Audio;
    vi.stubGlobal('Audio', class extends RealAudio { constructor() { super(); created.push(this); } });

    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );
    const audio = created[0]!;
    const at = (t: number) => {
      Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => t, set: () => {} });
      audio.dispatchEvent(new Event('timeupdate'));
    };
    // 0 -> 6 s listened, then a seek to 100 s (not listening), then 100 -> 106 s.
    for (let t = 0; t <= 6; t += 0.5) at(t);
    for (let t = 100; t <= 106; t += 0.5) at(t);
    expect(playTrackMock).not.toHaveBeenCalled(); // sent when the listen ends

    audio.dispatchEvent(new Event('ended'));
    expect(playTrackMock).toHaveBeenCalledTimes(1);
    expect(playTrackMock).toHaveBeenCalledWith('42', 12);
    vi.unstubAllGlobals();
  });

  it('does not record a listen shorter than 10 seconds', async () => {
    playTrackMock.mockClear();
    const state = { ...defaultPlayerState, currentTrack: createTrack('7', 'Skipped'), isPlaying: true, useHls: false };
    vi.mocked(usePlayerStore).mockReturnValue(state as any);
    (usePlayerStore as any).getState = () => state;
    const created: HTMLAudioElement[] = [];
    const RealAudio = window.Audio;
    vi.stubGlobal('Audio', class extends RealAudio { constructor() { super(); created.push(this); } });

    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );
    const audio = created[0]!;
    for (let t = 0; t <= 5; t += 0.5) {
      Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => t, set: () => {} });
      audio.dispatchEvent(new Event('timeupdate'));
    }
    audio.dispatchEvent(new Event('ended'));
    expect(playTrackMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('waits and retries a rate-limited stream instead of skipping the track', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const next = vi.fn();
    const state = { ...defaultPlayerState, currentTrack: createTrack('9', 'Busy'), isPlaying: true, useHls: false, next, pause: vi.fn() };
    vi.mocked(usePlayerStore).mockReturnValue(state as any);
    (usePlayerStore as any).getState = () => state;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 429, headers: new Headers({ 'Retry-After': '2' }) }));
    const created: HTMLAudioElement[] = [];
    const RealAudio = window.Audio;
    vi.stubGlobal('Audio', class extends RealAudio { constructor() { super(); created.push(this); } });

    render(
      <MemoryRouter>
        <Player />
      </MemoryRouter>
    );
    const audio = created[0]!;
    audio.setAttribute('src', '/api/v1/tracks/9/stream');
    Object.defineProperty(audio, 'error', { value: { code: 2 } });
    const toastsBefore = useToastStore.getState().toasts.length;
    audio.dispatchEvent(new Event('error'));

    await vi.advanceTimersByTimeAsync(2500);
    expect(next).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.length).toBe(toastsBefore);
    // The source was re-attached for a new attempt.
    expect(audio.src).toContain('/api/v1/tracks/9/stream');

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
