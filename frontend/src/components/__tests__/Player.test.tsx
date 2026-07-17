import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Player from '../Player';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';

vi.mock('@/stores/playerStore');
vi.mock('@/api/tracks', () => ({
  getTrackStreamUrl: (id: string) => `/api/v1/tracks/${id}/stream`,
  resolveCoverUrl: (url: string | null | undefined) => url || '/placeholder-album.svg',
}));
vi.mock('@/components/SynchronizedLyrics', () => ({
  default: () => <div data-testid="lyrics">Lyrics</div>,
}));
vi.mock('@/components/DownloadButton', () => ({
  default: () => <div data-testid="download-btn">Download</div>,
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
});
