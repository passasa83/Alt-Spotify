import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import client from '../client';

// Fake transport: 401 for the expired token, 200 for the new one.
const adapter = vi.fn(async (config: any) => {
  const auth = config.headers?.Authorization || config.headers?.get?.('Authorization');
  const ok = auth === 'Bearer new-access';
  if (!ok) {
    return Promise.reject({ config, response: { status: 401, data: {}, headers: {}, config } });
  }
  return { data: { url: config.url }, status: 200, statusText: 'OK', headers: {}, config };
});

beforeEach(() => {
  adapter.mockClear();
  client.defaults.adapter = adapter as any;
  localStorage.setItem('access_token', 'old-access');
  localStorage.setItem('refresh_token', 'old-refresh');
});

describe('API client token refresh', () => {
  it('refreshes once for concurrent 401s (refresh tokens are single-use)', async () => {
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh' },
    });

    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('/api/v1/auth/refresh', { refresh_token: 'old-refresh' });
    expect(results.map((r) => r.data.url)).toEqual(['/a', '/b', '/c']);
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
    refresh.mockRestore();
  });

  it('uses tokens rotated by another tab instead of failing', async () => {
    const refresh = vi.spyOn(axios, 'post').mockImplementation(async () => {
      // The other tab won the race and stored its new pair.
      localStorage.setItem('access_token', 'new-access');
      localStorage.setItem('refresh_token', 'other-tab-refresh');
      return Promise.reject({ response: { status: 401 } });
    });

    const result = await client.get('/x');

    expect(result.status).toBe(200);
    expect(localStorage.getItem('refresh_token')).toBe('other-tab-refresh');
    refresh.mockRestore();
  });
});

describe('client request interceptor', () => {
  it('adds auth header when token exists', () => {
    localStorage.setItem('access_token', 'my-token');
    const config = { headers: {} } as any;
    const interceptor = (client.interceptors.request as any).handlers[0].fulfilled;
    const result = interceptor(config);
    expect(result.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not add auth header when no token', () => {
    localStorage.clear();
    const config = { headers: {} } as any;
    const interceptor = (client.interceptors.request as any).handlers[0].fulfilled;
    const result = interceptor(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});
