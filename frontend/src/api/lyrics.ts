import client from './client';
import type { LyricsLine } from '@/types';

export const getLyrics = async (trackId: string): Promise<string> => {
  const response = await client.get(`/lyrics/${trackId}`);
  return response.data.lyrics_lrc;
};

export const getParsedLyrics = async (trackId: string): Promise<LyricsLine[]> => {
  const response = await client.get(`/lyrics/${trackId}/parsed`);
  return response.data.lines;
};
