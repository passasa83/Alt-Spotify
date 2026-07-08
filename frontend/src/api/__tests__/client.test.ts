import { describe, it, expect, vi, beforeEach } from 'vitest';
import client from '../client';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('client', () => {
  it('adds auth header when token exists', async () => {
    localStorage.setItem('access_token', 'my-token');
    const config = { headers: {} } as any;
    const interceptor = (client.interceptors.request as any).handlers[0].fulfilled;
    const result = interceptor(config);
    expect(result.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not add auth header when no token', () => {
    const config = { headers: {} } as any;
    const interceptor = (client.interceptors.request as any).handlers[0].fulfilled;
    const result = interceptor(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});
