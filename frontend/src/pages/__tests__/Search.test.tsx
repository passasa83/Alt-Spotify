import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SearchPage from '../Search';
import { getTracks } from '@/api/tracks';

// Read by the fake useSearch hook below, so a test can turn the error on.
let searchError: string | null = null;

vi.mock('@/hooks/useSearch', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useSearch: () => {
      const [query, setQuery] = React.useState('');
      const [filters, setFilters] = React.useState<Record<string, any>>({});
      return {
        query,
        setQuery,
        filters,
        setFilters,
        source: 'local',
        setSource: () => {},
        results: { tracks: [], artists: [], albums: [], playlists: [] },
        isLoading: false,
        error: searchError,
      };
    },
  };
});

vi.mock('@/api/tracks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/tracks')>();
  return {
    ...actual,
    getTracks: vi.fn(),
    // Tiles only for the genres that have tracks.
    getGenres: vi.fn().mockResolvedValue([
      { genre: 'Pop', count: 3 },
      { genre: 'Rock', count: 1 },
    ]),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

describe('Search', () => {
  beforeEach(() => {
    searchError = null;
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(<MemoryRouter><SearchPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText('What do you want to listen to?')).toBeInTheDocument();
  });

  it('renders browse genres section', async () => {
    render(<MemoryRouter><SearchPage /></MemoryRouter>);
    expect(screen.getByText('Browse all')).toBeInTheDocument();
    expect(await screen.findByText('Pop')).toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
    expect(screen.getByText('3 tracks')).toBeInTheDocument();
    // No tile for a genre without tracks.
    expect(screen.queryByText('Jazz')).not.toBeInTheDocument();
  });

  it('browses a genre when its tile is clicked', async () => {
    vi.mocked(getTracks).mockResolvedValue({
      items: [
        {
          id: 't1',
          title: 'Genre Song',
          artist_id: 'a1',
          artist: { id: 'a1', name: 'Artist One' },
          duration_seconds: 180,
          play_count: 0,
          created_at: '2026-01-01',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      pages: 1,
    } as any);

    render(<MemoryRouter><SearchPage /></MemoryRouter>);
    await userEvent.click(await screen.findByText('Pop'));

    expect(await screen.findByText('Back to all genres')).toBeInTheDocument();
    await waitFor(() => expect(getTracks).toHaveBeenCalledWith(1, 50, { genre: 'Pop', playable: true }));
    expect(await screen.findByText('Genre Song')).toBeInTheDocument();
    // The tile grid is replaced by the genre results.
    expect(screen.queryByText('Browse all')).not.toBeInTheDocument();
  });

  it('shows a message when the search request fails', () => {
    searchError = 'Failed to search';
    render(<MemoryRouter><SearchPage /></MemoryRouter>);

    expect(screen.getByText('The search failed. Please try again.')).toBeInTheDocument();
  });
});
