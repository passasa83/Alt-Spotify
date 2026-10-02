import axios from 'axios';
import { recordError, stripQuery } from '@/utils/diagnostics';

const client = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const clearSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('media_token');
  localStorage.removeItem('media_token_exp');
};

let refreshInFlight: Promise<string> | null = null;

/**
 * New access token from the refresh token. Refresh tokens are single-use
 * (rotation, a reused one revokes every session), so concurrent 401s share
 * one call, and a rotation already done by another tab is picked up instead
 * of replaying the old token.
 */
export const refreshAccessToken = (): Promise<string> => {
  if (!refreshInFlight) {
    const usedRefreshToken = localStorage.getItem('refresh_token');
    refreshInFlight = (async () => {
      if (!usedRefreshToken) throw new Error('No refresh token');
      try {
        const response = await axios.post('/api/v1/auth/refresh', { refresh_token: usedRefreshToken });
        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return access_token as string;
      } catch (err) {
        // Another tab rotated the tokens meanwhile: theirs are good.
        const current = localStorage.getItem('refresh_token');
        const access = localStorage.getItem('access_token');
        if (current && current !== usedRefreshToken && access) return access;
        throw err;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (originalRequest?.url) {
      const method = String(originalRequest.method || 'get').toUpperCase();
      recordError(`HTTP ${error.response?.status ?? 'network error'} ${method} ${stripQuery(originalRequest.url)}`);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      // Token renewed since this request left (other request or tab): just retry.
      const sentWith = String(originalRequest.headers?.Authorization || '').replace(/^Bearer /, '');
      const stored = localStorage.getItem('access_token');
      if (stored && sentWith && stored !== sentWith) {
        originalRequest.headers.Authorization = `Bearer ${stored}`;
        return client(originalRequest);
      }
      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      } catch {
        clearSession();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
