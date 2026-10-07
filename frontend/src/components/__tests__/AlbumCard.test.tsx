import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AlbumCard from '../AlbumCard';
import { getAlbumTracks } from '@/api/albums';
import { usePlayerStore } from '@/stores/playerStore';
import type { Album, Track } from '@/types';

vi.mock('@/api/albums', () => ({
  getAlbumTracks: vi.fn(),
  getAlbum: vi.fn(),
}));

const mockGetAlbumTracks = vi.mocked(getAlbumTracks);

const createAlbum = (id: string, title: string): Album => ({
  id,
  title,
  artist_id: 'artist-1',
  artist: { id: 'artist-1', name: 'Band', created_at: '' },
  created_at: '',
});

const createTrack = (id: string, albumId: string): Track => ({
  id,
  title: `Song ${id}`,
  artist_id: 'artist-1',
  album_id: albumId,
  file_url: `local:/test/${id}.flac`,
  duration_seconds: 180,
  play_count: 0,
  is_explicit: false,
  created_at: '',
});

const renderCards = () => {
  render(
    <MemoryRouter>
      <AlbumCard album={createAlbum('a1', 'Album One')} />
      <AlbumCard album={createAlbum('a2', 'Album Two')} />
    </MemoryRouter>,
  );
};

describe('AlbumCard', () => {
  beforeEach(() => {
    mockGetAlbumTracks.mockReset();
    mockGetAlbumTracks.mockImplementation(async (albumId: string) => [createTrack(`t-${albumId}`, albumId)]);
    usePlayerStore.setState({
      currentTrack: null,
      queue: [],
      autoQueuedIds: [],
      context: null,
      history: [],
      isPlaying: false,
    });
  });

  it('shows play on every card when nothing is playing', () => {
    renderCards();
    expect(screen.getByRole('button', { name: 'Play Album One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Album Two' })).toBeInTheDocument();
  });

  it('shows pause and a highlighted title on the album being played', () => {
    usePlayerStore.setState({ currentTrack: createTrack('t-a1', 'a1'), isPlaying: true });

    renderCards();

    expect(screen.getByRole('button', { name: 'Pause Album One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Album Two' })).toBeInTheDocument();
    expect(screen.getByText('Album One')).toHaveClass('text-green-500');
    expect(screen.getByText('Album Two')).not.toHaveClass('text-green-500');
  });

  it('reveals the play button on hover only, even for the album being played', () => {
    usePlayerStore.setState({ currentTrack: createTrack('t-a1', 'a1'), isPlaying: true });

    renderCards();

    // Hover-only: no pinned visible button, the green title marks the album.
    expect(screen.getByRole('button', { name: 'Pause Album One' })).not.toHaveClass('opacity-100');
    expect(screen.getByRole('button', { name: 'Pause Album One' })).toHaveClass('group-hover:opacity-100');
  });

  it('pauses instead of restarting when clicking the album being played', async () => {
    usePlayerStore.setState({ currentTrack: createTrack('t-a1', 'a1'), isPlaying: true });
    renderCards();
    await waitFor(() => expect(mockGetAlbumTracks).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Pause Album One' }));

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(screen.getByRole('button', { name: 'Play Album One' })).toBeInTheDocument();
  });

  it('starts the album from the top when clicking another album', async () => {
    usePlayerStore.setState({ currentTrack: createTrack('t-a1', 'a1'), isPlaying: true });
    renderCards();
    await waitFor(() => expect(mockGetAlbumTracks).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Play Album Two' }));

    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('t-a2');
    expect(state.isPlaying).toBe(true);
  });
});
