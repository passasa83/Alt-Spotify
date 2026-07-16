import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home';

vi.mock('@/api/tracks', () => ({
  getTracks: vi.fn().mockResolvedValue({
    items: [
      { id: '1', title: 'Track One', artist_id: 'a1', duration_seconds: 180, play_count: 0, created_at: '2024-01-01' },
      { id: '2', title: 'Track Two', artist_id: 'a1', duration_seconds: 200, play_count: 0, created_at: '2024-01-01' },
    ],
    total: 2,
    page: 1,
    page_size: 10,
    pages: 1,
  }),
}));

vi.mock('@/api/artists', () => ({
  getArtists: vi.fn().mockResolvedValue({
    items: [
      { id: 'a1', name: 'Artist One', created_at: '2024-01-01' },
    ],
    total: 1,
    page: 1,
    page_size: 8,
    pages: 1,
  }),
}));

vi.mock('@/api/playlists', () => ({
  getPlaylists: vi.fn().mockResolvedValue({
    items: [
      { id: 1, title: 'Playlist One', name: 'Playlist One', owner_id: '1', is_public: true, is_collaborative: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
    ],
    total: 1,
    page: 1,
    page_size: 8,
    pages: 1,
  }),
}));

vi.mock('@/components/TrackCard', () => ({
  default: ({ track }: any) => <div data-testid="track-card">{track.title}</div>,
}));

vi.mock('@/components/ArtistCard', () => ({
  default: ({ artist }: any) => <div data-testid="artist-card">{artist.name}</div>,
}));

vi.mock('@/components/PlaylistCard', () => ({
  default: ({ playlist }: any) => <div data-testid="playlist-card">{playlist.name || playlist.title}</div>,
}));

describe('Home', () => {
  it('renders home page with sections', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Top Tracks')).toBeInTheDocument();
    expect(screen.getByText('Top Artists')).toBeInTheDocument();
    expect(screen.getByText('Playlists')).toBeInTheDocument();
  });
});
