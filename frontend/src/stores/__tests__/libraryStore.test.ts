import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLibraryStore } from '../libraryStore';
import type { Track } from '@/types';

vi.mock('@/api/playlists', () => ({
  getPlaylists: vi.fn(),
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
}));

vi.mock('@/api/favorites', () => ({
  getFavorites: vi.fn(),
  addFavorite: vi.fn().mockResolvedValue({}),
  removeFavorite: vi.fn().mockResolvedValue({}),
}));

import * as playlistsApi from '@/api/playlists';

const mockGetPlaylists = vi.mocked(playlistsApi.getPlaylists);

const createTrack = (id: string, title = 'Test Track'): Track => ({
  id,
  title,
  artist_id: 'artist-1',
  duration_seconds: 180,
  play_count: 0,
  created_at: '2024-01-01',
});

beforeEach(() => {
  useLibraryStore.setState({
    playlists: [],
    favorites: [],
    isLoading: false,
  });
  localStorage.clear();
});

describe('libraryStore', () => {
  it('has correct initial state', () => {
    const state = useLibraryStore.getState();
    expect(state.playlists).toEqual([]);
    expect(state.favorites).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('loadPlaylists fetches and stores playlists', async () => {
    const playlists = [
      { id: 1, title: 'My Playlist', owner_id: '1', is_public: true, is_collaborative: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'Another', owner_id: '1', is_public: true, is_collaborative: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
    ];
    mockGetPlaylists.mockResolvedValueOnce({
      items: playlists as any,
      total: 2,
      page: 1,
      page_size: 100,
      pages: 1,
    });

    await useLibraryStore.getState().loadPlaylists();

    expect(useLibraryStore.getState().playlists).toEqual(playlists);
    expect(useLibraryStore.getState().isLoading).toBe(false);
  });

  it('addToFavorites adds track', async () => {
    const track = createTrack('1');
    await useLibraryStore.getState().addToFavorites(track);

    expect(useLibraryStore.getState().favorites).toEqual([track]);
  });

  it('addToFavorites does not duplicate', async () => {
    const track = createTrack('1');
    await useLibraryStore.getState().addToFavorites(track);
    await useLibraryStore.getState().addToFavorites(track);

    expect(useLibraryStore.getState().favorites).toHaveLength(1);
  });

  it('removeFromFavorites removes track', async () => {
    const track1 = createTrack('1');
    const track2 = createTrack('2');
    await useLibraryStore.getState().addToFavorites(track1);
    await useLibraryStore.getState().addToFavorites(track2);

    await useLibraryStore.getState().removeFromFavorites('1');

    expect(useLibraryStore.getState().favorites).toHaveLength(1);
    expect(useLibraryStore.getState().favorites[0].id).toBe('2');
  });
});
