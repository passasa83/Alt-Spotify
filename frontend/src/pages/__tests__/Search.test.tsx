import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchPage from '../Search';

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    query: '',
    setQuery: vi.fn(),
    results: { tracks: [], artists: [], albums: [], playlists: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

describe('Search', () => {
  it('renders search input', () => {
    render(<SearchPage />);
    expect(screen.getByPlaceholderText('What do you want to listen to?')).toBeInTheDocument();
  });

  it('renders browse genres section', () => {
    render(<SearchPage />);
    expect(screen.getByText('Browse all')).toBeInTheDocument();
    expect(screen.getByText('Pop')).toBeInTheDocument();
    expect(screen.getByText('Rock')).toBeInTheDocument();
  });
});
