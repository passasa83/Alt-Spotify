import client from './client';

/**
 * Restricted token for media URLs (<audio src>, <img src>): such URLs end up
 * in proxy logs and browser history, so they must not carry the access token
 * that opens the whole API. It only allows streaming and covers.
 */
const TOKEN_KEY = 'media_token';
const EXPIRES_KEY = 'media_token_exp';
// Renew well before expiry: a track can play for a while on one URL.
const RENEW_BEFORE_MS = 60 * 60 * 1000;

const read = (): { token: string; expiresAt: number } | null => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY));
    return token && expiresAt ? { token, expiresAt } : null;
  } catch {
    return null;
  }
};

/** The media token if it is still valid for a few minutes, else null. */
export const getMediaToken = (): string | null => {
  const stored = read();
  return stored && stored.expiresAt - Date.now() > 5 * 60 * 1000 ? stored.token : null;
};

let inFlight: Promise<void> | null = null;

export const refreshMediaToken = (): Promise<void> => {
  if (!inFlight) {
    inFlight = client
      .get('/auth/media-token')
      .then(({ data }) => {
        localStorage.setItem(TOKEN_KEY, data.media_token);
        localStorage.setItem(EXPIRES_KEY, String(Date.now() + data.expires_in * 1000));
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

/** Get a media token if there is none or it expires within the hour. */
export const ensureMediaToken = async (): Promise<void> => {
  const stored = read();
  if (!stored || stored.expiresAt - Date.now() < RENEW_BEFORE_MS) {
    await refreshMediaToken().catch(() => {});
  }
};

export const clearMediaToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
};
