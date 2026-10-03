import client from './client';
import { onTokensCleared } from './session';

/**
 * Restricted token for audio URLs (players cannot send headers): it only
 * opens streaming and covers, never the rest of the API. Kept in memory.
 */
let mediaToken: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;
// Renew well before expiry: a long track or album plays from one URL.
const RENEW_BEFORE_MS = 60 * 60 * 1000;

onTokensCleared(() => {
  mediaToken = null;
});

export const getMediaToken = async (): Promise<string> => {
  if (mediaToken && mediaToken.expiresAt - Date.now() > RENEW_BEFORE_MS) return mediaToken.token;
  if (!inFlight) {
    inFlight = client
      .get('/auth/media-token')
      .then(({ data }) => {
        mediaToken = { token: data.media_token, expiresAt: Date.now() + data.expires_in * 1000 };
        return data.media_token as string;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

/** `url` with the media token appended, for audio players. */
export const withMediaToken = async (url: string): Promise<string> => {
  const token = await getMediaToken();
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};
