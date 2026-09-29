import client from './client';
import type { Track, PaginatedResponse } from '@/types';

export interface UploadResult {
  track_id: string;
  task_id?: string;
  status?: string;
  message?: string;
}

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

// <audio> can't send an Authorization header: media URLs carry the token.
export const withToken = (url: string): string => {
  const token = localStorage.getItem('access_token');
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
};

export const getTrackStreamUrl = (trackId: string): string => {
  return withToken(`/api/v1/tracks/${trackId}/stream`);
};

// No token in the URL: HLS.js authenticates each request with a header, and
// relative playlist/segment URLs would drop the query string anyway.
export const getHlsStreamUrl = (trackId: string): string => {
  return `/api/v1/stream/${trackId}/master.m3u8`;
};

export const uploadTrack = async (file: File, metadata: Record<string, any>): Promise<UploadResult> => {
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
