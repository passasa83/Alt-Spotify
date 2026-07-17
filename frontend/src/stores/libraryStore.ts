import { create } from 'zustand';
import type { Playlist, Track } from '@/types';
import * as playlistsApi from '@/api/playlists';
import * as favoritesApi from '@/api/favorites';

interface LibraryState {
  playlists: Playlist[];
  favorites: Track[];
  isLoading: boolean;
  loadPlaylists: () => Promise<void>;
  loadFavorites: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  deletePlaylist: (id: number) => Promise<void>;
  addToFavorites: (track: Track) => Promise<void>;
  removeFromFavorites: (trackId: string) => Promise<void>;
  isFavorite: (trackId: string) => boolean;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  playlists: [],
  favorites: [],
  isLoading: false,

  loadPlaylists: async () => {
    set({ isLoading: true });
    try {
      const response = await playlistsApi.getPlaylists(1, 100);
      set({ playlists: response.items, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadFavorites: async () => {
    try {
      const response = await favoritesApi.getFavorites('track', 1, 100);
      set({ favorites: response.items });
    } catch {
      // Fallback to localStorage
      const stored = localStorage.getItem('favorites');
      if (stored) {
        set({ favorites: JSON.parse(stored) });
      }
    }
  },

  createPlaylist: async (name, description) => {
    const playlist = await playlistsApi.createPlaylist({ title: name, description });
    const { playlists } = get();
    set({ playlists: [...playlists, playlist] });
    return playlist;
  },

  deletePlaylist: async (id) => {
    await playlistsApi.deletePlaylist(String(id));
    const { playlists } = get();
    set({ playlists: playlists.filter((p) => p.id !== id) });
  },

  addToFavorites: async (track) => {
    try {
      await favoritesApi.addFavorite('track', String(track.id));
      const { favorites } = get();
      if (!favorites.find((t) => t.id === track.id)) {
        set({ favorites: [...favorites, track] });
      }
    } catch {
      // Fallback to localStorage
      const { favorites } = get();
      if (!favorites.find((t) => t.id === track.id)) {
        const newFavorites = [...favorites, track];
        localStorage.setItem('favorites', JSON.stringify(newFavorites));
        set({ favorites: newFavorites });
      }
    }
  },

  removeFromFavorites: async (trackId) => {
    try {
      await favoritesApi.removeFavorite('track', trackId);
    } catch {
      // Continue with local removal
    }
    const { favorites } = get();
    const newFavorites = favorites.filter((t) => String(t.id) !== trackId);
    localStorage.setItem('favorites', JSON.stringify(newFavorites));
    set({ favorites: newFavorites });
  },

  isFavorite: (trackId) => {
    return get().favorites.some((t) => String(t.id) === trackId);
  },
}));
