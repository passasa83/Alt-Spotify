import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearch } from '../useSearch';

vi.mock('@/api/search', () => ({
  search: vi.fn(),
}));

import * as searchApi from '@/api/search';

const mockSearch = vi.mocked(searchApi.search);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockSearch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSearch', () => {
  it('debounce delays search', async () => {
    mockSearch.mockResolvedValue({ tracks: [], artists: [], albums: [], playlists: [] });

    const { result } = renderHook(() => useSearch(300));

    act(() => {
      result.current.setQuery('test');
    });

    expect(mockSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSearch).toHaveBeenCalledWith('test', {}, 'local');
  });

  it('search calls API with results', async () => {
    const tracks = [{ id: '1', title: 'Found Track', artist_id: 'a1', duration_seconds: 180, play_count: 0, created_at: '2024-01-01' }];
    mockSearch.mockResolvedValue({ tracks: tracks as any, artists: [], albums: [], playlists: [] });

    const { result } = renderHook(() => useSearch(100));

    act(() => {
      result.current.setQuery('found');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    await vi.runAllTimersAsync();

    expect(result.current.results.tracks).toHaveLength(1);
    expect(result.current.results.tracks[0].title).toBe('Found Track');
  });

  it('empty query clears results', async () => {
    const { result } = renderHook(() => useSearch(100));

    act(() => {
      result.current.setQuery('');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    await vi.runAllTimersAsync();

    expect(result.current.results.tracks).toEqual([]);
  });

  it('search error sets error state', async () => {
    mockSearch.mockImplementation(() => Promise.reject(new Error('Network error')));

    const { result } = renderHook(() => useSearch(100));

    act(() => {
      result.current.setQuery('fail');
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.error).toBe('Failed to search');
  });
});
