import client from './client';
import type { LyricsLine } from '@/types';

export const getLyrics = async (trackId: number): Promise<string> => {
  const response = await client.get(`/lyrics/${trackId}`);
  return response.data;
};

export const getParsedLyrics = async (trackId: number): Promise<LyricsLine[]> => {
  const response = await client.get(`/lyrics/${trackId}/parsed`);
  return response.data;
};
