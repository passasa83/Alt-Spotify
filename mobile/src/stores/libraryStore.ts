import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Playlist, Track } from '../types';
import * as playlistsApi from '../api/playlists';

interface LibraryState {
  playlists: Playlist[];
  favorites: Track[];
  isLoading: boolean;
  loadPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  addToFavorites: (track: Track) => Promise<void>;
  removeFromFavorites: (trackId: string) => Promise<void>;
  isFavorite: (trackId: string) => boolean;
  loadFavorites: () => Promise<void>;
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

  createPlaylist: async (name, description) => {
    const playlist = await playlistsApi.createPlaylist({ name, description });
    const { playlists } = get();
    set({ playlists: [...playlists, playlist] });
    return playlist;
  },

  deletePlaylist: async (id) => {
    await playlistsApi.deletePlaylist(id);
    const { playlists } = get();
    set({ playlists: playlists.filter((p) => p.id !== id) });
  },

  loadFavorites: async () => {
    try {
      const stored = await AsyncStorage.getItem('favorites');
      if (stored) {
        set({ favorites: JSON.parse(stored) });
      }
    } catch {}
  },

  addToFavorites: async (track) => {
    const { favorites } = get();
    if (!favorites.find((t) => t.id === track.id)) {
      const newFavorites = [...favorites, track];
      await AsyncStorage.setItem('favorites', JSON.stringify(newFavorites));
      set({ favorites: newFavorites });
    }
  },

  removeFromFavorites: async (trackId) => {
    const { favorites } = get();
    const newFavorites = favorites.filter((t) => t.id !== trackId);
    await AsyncStorage.setItem('favorites', JSON.stringify(newFavorites));
    set({ favorites: newFavorites });
  },

  isFavorite: (trackId) => {
    return get().favorites.some((t) => t.id === trackId);
  },
}));
