import client from './client';
import type { JamSession } from '../types';

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
