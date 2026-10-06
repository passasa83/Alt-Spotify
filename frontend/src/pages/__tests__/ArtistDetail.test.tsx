import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtistDetail from '../ArtistDetail';
import { getTracks } from '@/api/tracks';
import { getArtistAlbums } from '@/api/artists';
import { usePlayerStore } from '@/stores/playerStore';

const tracks = Array.from({ length: 12 }, (_, n) => ({
  id: `t${n}`,
  title: `Song ${n}`,
  artist_id: 'a1',
  album_id: null,
  duration_seconds: 180,
  play_count: 12 - n,
  created_at: '2024-01-01',
}));

vi.mock('@/api/tracks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/tracks')>()),
  getTracks: vi.fn(),
}));

vi.mock('@/api/artists', () => ({
  getArtist: vi.fn().mockResolvedValue({ id: 'a1', name: 'Solo Artist', created_at: '2024-01-01' }),
  // The artist's only album is empty: tracks must not come from it.
  getArtistAlbums: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }),
}));

vi.mock('@/components/TrackList', () => ({
  default: ({ tracks }: any) => <ul>{tracks.map((t: any) => <li key={t.id}>{t.title}</li>)}</ul>,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/artist/a1']}>
      <Routes>
        <Route path="/artist/:id" element={<ArtistDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ArtistDetail', () => {
  const setPlaylistAsQueue = vi.fn();

  beforeEach(() => {
    vi.mocked(getTracks).mockResolvedValue({ items: tracks, total: 40, page: 1, page_size: 100, pages: 1 } as any);
    setPlaylistAsQueue.mockClear();
    usePlayerStore.setState({ setPlaylistAsQueue });
  });

  it('loads the artist tracks by popularity, even without albums, and plays them', async () => {
    renderPage();

    expect(await screen.findByText('Song 0')).toBeInTheDocument();
    expect(getTracks).toHaveBeenCalledWith(1, 100, { artistId: 'a1', playable: true, sort: 'play_count', order: 'desc' });
    // Top 10 first, the rest behind "show more".
    expect(screen.queryByText('Song 10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show more'));
    expect(screen.getByText('Song 11')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(setPlaylistAsQueue).toHaveBeenCalledWith(tracks, 0);
  });

  it('disables play when the artist has no playable track', async () => {
    vi.mocked(getTracks).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 0 } as any);
    renderPage();

    expect(await screen.findByText('No playable track for this artist yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('filters popular tracks by album from the chips', async () => {
    const albumTracks = [
      { id: 't1', title: 'Album One Song', artist_id: 'a1', album_id: 'al1', duration_seconds: 180, play_count: 5, created_at: '2024-01-01' },
      { id: 't2', title: 'Album Two Song', artist_id: 'a1', album_id: 'al2', duration_seconds: 180, play_count: 4, created_at: '2024-01-02' },
    ];
    vi.mocked(getTracks).mockResolvedValue({ items: albumTracks, total: 2, page: 1, page_size: 100, pages: 1 } as any);
    vi.mocked(getArtistAlbums).mockResolvedValue({
      items: [
        { id: 'al1', title: 'First Album', artist_id: 'a1', created_at: '2024-01-01' },
        { id: 'al2', title: 'Second Album', artist_id: 'a1', created_at: '2024-01-02' },
      ],
      total: 2, page: 1, page_size: 50, pages: 1,
    } as any);
    renderPage();

    expect(await screen.findByText('Album One Song')).toBeInTheDocument();
    expect(screen.getByText('Album Two Song')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Second Album' }));
    expect(screen.queryByText('Album One Song')).not.toBeInTheDocument();
    expect(screen.getByText('Album Two Song')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(setPlaylistAsQueue).toHaveBeenCalledWith([albumTracks[1]], 0);
  });
});
