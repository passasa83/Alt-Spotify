import client from './client';
import type { Track, PaginatedResponse } from '@/types';

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
  return `/api/v1/tracks/${trackId}/stream`;
};

export const getHlsStreamUrl = (trackId: string): string => {
  return `/api/v1/stream/${trackId}/master.m3u8`;
};

export const uploadTrack = async (file: File, metadata: Record<string, any>): Promise<Track> => {
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const response = await client.post('/upload/audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getTrackDownloadUrl = (trackId: string): string => {
  return `/api/v1/stream/${trackId}/download`;
};

export const updateTrack = async (id: string, data: Record<string, any>): Promise<Track> => {
  const response = await client.put(`/tracks/${id}`, data);
  return response.data;
};

export const deleteTrack = async (id: string): Promise<void> => {
  await client.delete(`/tracks/${id}`);
};

export const uploadLyrics = async (trackId: string, file: File): Promise<{ message: string; lines_count: number }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post(`/upload/lyrics/${trackId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
