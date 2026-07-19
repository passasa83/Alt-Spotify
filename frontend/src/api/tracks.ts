import client from './client';
import type { Track, PaginatedResponse } from '@/types';

export const resolveCoverUrl = (url: string | null | undefined): string => {
  if (!url) return '/placeholder-album.svg';
  if (url.startsWith('local_cover:')) {
    const token = localStorage.getItem('access_token');
    const path = url.substring('local_cover:'.length);
    return `/api/v1/local/covers${path.startsWith('/') ? path : `/${path}`}${token ? `?token=${token}` : ''}`;
  }
  return url;
};

export const getTracks = async (page = 1, pageSize = 20): Promise<PaginatedResponse<Track>> => {
  const response = await client.get('/tracks', { params: { page, page_size: pageSize } });
  return response.data;
};

export const getLocalTracks = async (page = 1, pageSize = 50): Promise<PaginatedResponse<Track>> => {
  const response = await client.get('/tracks', { params: { page, page_size: pageSize, local_only: true, sort: 'created_at', order: 'desc' } });
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
  const token = localStorage.getItem('access_token');
  return `/api/v1/tracks/${trackId}/stream${token ? `?token=${token}` : ''}`;
};

export const getHlsStreamUrl = (trackId: string): string => {
  const token = localStorage.getItem('access_token');
  return `/api/v1/stream/${trackId}/master.m3u8${token ? `?token=${token}` : ''}`;
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

export const fetchFromYoutube = async (trackId: string, youtubeUrl?: string): Promise<any> => {
  const response = await client.post(`/tracks/${trackId}/fetch-youtube`, youtubeUrl ? { youtube_url: youtubeUrl } : {});
  return response.data;
};

export const fetchFromYoutubeUrl = async (youtubeUrl: string, title?: string, artist?: string): Promise<any> => {
  const params = new URLSearchParams({ youtube_url: youtubeUrl });
  if (title) params.append('title', title);
  if (artist) params.append('artist', artist);
  const response = await client.post(`/tracks/fetch-url?${params.toString()}`);
  return response.data;
};
