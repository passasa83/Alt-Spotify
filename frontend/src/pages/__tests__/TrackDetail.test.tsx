import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TrackDetail from '../TrackDetail';
import { getTrack } from '@/api/tracks';
import { getAlbumTracks } from '@/api/albums';

vi.mock('@/api/tracks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/tracks')>()),
  getTrack: vi.fn(),
}));

vi.mock('@/api/albums', () => ({
  getAlbum: vi.fn(),
  getAlbumTracks: vi.fn(),
}));

vi.mock('@/api/lyrics', () => ({
  getParsedLyrics: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/TrackList', () => ({
  default: ({ tracks }: any) => <ul>{tracks.map((t: any) => <li key={t.id}>{t.title}</li>)}</ul>,
}));

const albumTracks = [
  { id: 't1', title: 'First Song', artist_id: 'a1', album_id: 'al1', duration_seconds: 180, created_at: '2024-01-01' },
  { id: 't2', title: 'Second Song', artist_id: 'a1', album_id: 'al1', duration_seconds: 200, created_at: '2024-01-02' },
  { id: 't3', title: 'Third Song', artist_id: 'a1', album_id: 'al1', duration_seconds: 210, created_at: '2024-01-03' },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/track/t1']}>
      <Routes>
        <Route path="/track/:id" element={<TrackDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe('TrackDetail', () => {
  beforeEach(() => {
    vi.mocked(getTrack).mockResolvedValue({
      id: 't1',
      title: 'First Song',
      artist_id: 'a1',
      artist: { id: 'a1', name: 'Band' },
      album_id: 'al1',
      album: { id: 'al1', title: 'Greatest Hits' },
      duration_seconds: 180,
      created_at: '2024-01-01',
    } as any);
    vi.mocked(getAlbumTracks).mockResolvedValue(albumTracks as any);
  });

  it('shows the album of the title with its other tracks', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'First Song' })).toBeInTheDocument();
    const albumLinks = await screen.findAllByRole('link', { name: 'Greatest Hits' });
    // The header line and the album section both lead to the album.
    expect(albumLinks.length).toBeGreaterThan(0);
    for (const link of albumLinks) expect(link).toHaveAttribute('href', '/album/al1');
    expect(await screen.findByText('Second Song')).toBeInTheDocument();
    expect(screen.getByText('Third Song')).toBeInTheDocument();
    expect(screen.getByText('3 tracks')).toBeInTheDocument();
    expect(getAlbumTracks).toHaveBeenCalledWith('al1');
  });
});
