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

export const leaveJamSession = async (sessionId: number): Promise<void> => {
  await client.post(`/jam/leave/${sessionId}`);
};

export const getJamSession = async (sessionId: number): Promise<JamSession> => {
  const response = await client.get(`/jam/${sessionId}`);
  return response.data;
};

export const connectJamWebSocket = (sessionId: number): WebSocket => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('access_token');
  return new WebSocket(`${protocol}//${window.location.host}/api/v1/jam/${sessionId}/ws?token=${token}`);
};
