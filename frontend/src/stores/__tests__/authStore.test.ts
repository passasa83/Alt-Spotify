import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}));

import * as authApi from '@/api/auth';

const mockLogin = vi.mocked(authApi.login);
const mockGetMe = vi.mocked(authApi.getMe);

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });
});

describe('authStore', () => {
  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('login stores tokens and user', async () => {
    const tokens = { access_token: 'acc123', refresh_token: 'ref123', token_type: 'bearer' };
    const user = { id: '1', email: 'test@test.com', pseudo: 'Test', role: 'user' as const, is_active: true, created_at: '2024-01-01' };

    mockLogin.mockResolvedValueOnce(tokens);
    mockGetMe.mockResolvedValueOnce(user as any);

    await useAuthStore.getState().login('test@test.com', 'password');

    expect(localStorage.getItem('access_token')).toBe('acc123');
    expect(localStorage.getItem('refresh_token')).toBe('ref123');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('logout clears state', async () => {
    const tokens = { access_token: 'acc123', refresh_token: 'ref123', token_type: 'bearer' };
    const user = { id: '1', email: 'test@test.com', pseudo: 'Test', role: 'user' as const, is_active: true, created_at: '2024-01-01' };
    mockLogin.mockResolvedValueOnce(tokens);
    mockGetMe.mockResolvedValueOnce(user as any);
    await useAuthStore.getState().login('test@test.com', 'password');

    useAuthStore.getState().logout();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('refreshAuth updates user', async () => {
    const user = { id: '2', email: 'new@test.com', pseudo: 'NewUser', role: 'user' as const, is_active: true, created_at: '2024-01-01' };
    mockGetMe.mockResolvedValueOnce(user as any);

    await useAuthStore.getState().refreshAuth();

    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('login failure sets isLoading to false and throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(
      useAuthStore.getState().login('bad@test.com', 'wrong')
    ).rejects.toThrow('Invalid credentials');

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
