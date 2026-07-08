import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';
import * as authApi from '../api/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, pseudo: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setUser: (user: User) => void;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  restoreSession: async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        const user = await authApi.getMe();
        set({ user, isAuthenticated: true });
      }
    } catch {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const tokens = await authApi.login(email, password);
      await AsyncStorage.setItem('access_token', tokens.access_token);
      await AsyncStorage.setItem('refresh_token', tokens.refresh_token);
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, pseudo, password) => {
    set({ isLoading: true });
    try {
      await authApi.register(email, pseudo, password);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
    set({ user: null, isAuthenticated: false });
  },

  refreshAuth: async () => {
    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true });
    } catch {
      await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
      set({ user: null, isAuthenticated: false });
    }
  },

  setUser: (user) => set({ user }),
}));
