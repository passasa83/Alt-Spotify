import client from './client';
import type { Track, PaginatedResponse } from '../types';

export const getTracks = async (page = 1, pageSize = 20): Promise<PaginatedResponse<Track>> => {
  const response = await client.get('/tracks', { params: { page, page_size: pageSize } });
  return response.data;
};

export const getTrack = async (id: string): Promise<Track> => {
  const response = await client.get(`/tracks/${id}`);
  return response.data;
};

export const playTrack = async (trackId: string): Promise<void> => {
  await client.post(`/tracks/${trackId}/play`);
};

export const searchTracks = async (query: string): Promise<Track[]> => {
  const response = await client.get('/tracks', { params: { q: query } });
  return response.data.items;
};

export const getTrackStreamUrl = (trackId: string): string => {
  const baseURL = client.defaults.baseURL || '';
  return `${baseURL}/tracks/${trackId}/stream`;
};

export const getHlsStreamUrl = (trackId: string): string => {
  const baseURL = client.defaults.baseURL || '';
  return `${baseURL}/stream/${trackId}/master.m3u8`;
};

export const getTrackLyrics = async (trackId: string): Promise<string> => {
  const response = await client.get(`/lyrics/${trackId}`);
  return response.data.lyrics;
};

export const getTrackLyricsParsed = async (trackId: string): Promise<{ time_seconds: number; text: string }[]> => {
  const response = await client.get(`/lyrics/${trackId}/parsed`);
  return response.data.lyrics;
};
