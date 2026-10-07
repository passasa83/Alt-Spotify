import client from './client';
import type { JamSession } from '@/types';

export const createJamSession = async (): Promise<JamSession> => {
  const response = await client.post('/jam/create');
  return response.data;
};

export const joinJamSession = async (code: string): Promise<JamSession> => {
  const response = await client.post(`/jam/join/${code}`);
  return response.data;
};

export const leaveJamSession = async (sessionId: string): Promise<void> => {
  await client.post(`/jam/leave/${sessionId}`);
};

export const getJamSession = async (sessionId: string): Promise<JamSession> => {
  const response = await client.get(`/jam/${sessionId}`);
  return response.data;
};

export const connectJamWebSocket = (sessionId: string): WebSocket => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('access_token');
  return new WebSocket(`${protocol}//${window.location.host}/api/v1/jam/${sessionId}/ws?token=${token}`);
};

export interface JamLiveState {
  track_id: string;
  position_ms: number;
  is_playing: boolean;
  updated_at: number;
}

/** Where the jam currently is (track + position), for guests joining mid-song. Null when nothing plays. */
export const getJamNowPlaying = async (sessionId: string): Promise<JamLiveState | null> => {
  try {
    const response = await client.get(`/jam/now-playing/${sessionId}`);
    return response.data;
  } catch {
    return null;
  }
};
