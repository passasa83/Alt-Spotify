import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TrackList from '../TrackList';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';

vi.mock('@/stores/playerStore');

const createTrack = (id: string, title = 'Test Track'): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  file_url: 'local:/test/file.flac',
  duration_seconds: 245,
  play_count: 0,
  created_at: '2024-01-01',
  artist: { id: 'artist-1', name: 'Test Artist', created_at: '2024-01-01' },
  album: { id: 'album-1', title: 'Test Album', artist_id: 'artist-1', created_at: '2024-01-01' },
});

beforeEach(() => {
  vi.mocked(usePlayerStore).mockReturnValue({
    currentTrack: null,
    isPlaying: false,
    setTrack: vi.fn(),
    addToQueue: vi.fn(),
  } as any);
});

describe('TrackList', () => {
  it('renders track list', () => {
    const tracks = [createTrack('1', 'Song A'), createTrack('2', 'Song B')];
    render(
      <MemoryRouter>
        <TrackList tracks={tracks} />
      </MemoryRouter>
    );
    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <MemoryRouter>
        <TrackList tracks={[]} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Song')).not.toBeInTheDocument();
  });

  it('calls setTrack on track click', async () => {
    const user = userEvent.setup();
    const setTrack = vi.fn();
    vi.mocked(usePlayerStore).mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      setTrack,
      addToQueue: vi.fn(),
    } as any);

    const tracks = [createTrack('1', 'Click Me')];
    render(
      <MemoryRouter>
        <TrackList tracks={tracks} />
      </MemoryRouter>
    );

    const playButton = screen.getAllByRole('button')[0];
    await user.click(playButton);

    expect(setTrack).toHaveBeenCalledWith(tracks[0]);
  });
});
