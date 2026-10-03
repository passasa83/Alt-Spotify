import { create } from 'zustand';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../api/session';
import client from '../api/client';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { getMe } from '../api/users';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, pseudo: string, password: string, inviteToken?: string) => Promise<void>;
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
      const token = await getAccessToken();
      if (token) {
        const user = await getMe();
        set({ user, isAuthenticated: true });
      }
    } catch {
      await clearTokens();
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const tokens = await authApi.login(email, password);
      await saveTokens(tokens.access_token, tokens.refresh_token);
      const user = await getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (email, pseudo, password, inviteToken) => {
    set({ isLoading: true });
    try {
      await authApi.register(email, pseudo, password, inviteToken);
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    // Revoke the session server-side too (best effort: offline logout still works).
    const refreshToken = await getRefreshToken();
    await client.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : undefined).catch(() => {});
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  refreshAuth: async () => {
    try {
      const user = await getMe();
      set({ user, isAuthenticated: true });
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false });
    }
  },

  setUser: (user) => set({ user }),
}));
