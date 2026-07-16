import client from './client';
import type { Playlist, PlaylistTrack, PaginatedResponse } from '@/types';

export const getPlaylists = async (page = 1, perPage = 20): Promise<PaginatedResponse<Playlist>> => {
  const response = await client.get('/playlists', { params: { page, page_size: perPage } });
  return response.data;
};

export const getPlaylist = async (id: string): Promise<Playlist> => {
  const response = await client.get(`/playlists/${id}`);
  return response.data;
};

export const getPlaylistTracks = async (id: string): Promise<PlaylistTrack[]> => {
  const response = await client.get(`/playlists/${id}/tracks`);
  return response.data;
};

export const createPlaylist = async (data: { title: string; description?: string; is_public?: boolean }): Promise<Playlist> => {
  const response = await client.post('/playlists', data);
  return response.data;
};

export const updatePlaylist = async (id: string, data: { title?: string; description?: string; is_public?: boolean }): Promise<Playlist> => {
  const response = await client.put(`/playlists/${id}`, data);
  return response.data;
};

export const deletePlaylist = async (id: string): Promise<void> => {
  await client.delete(`/playlists/${id}`);
};

export const addTrackToPlaylist = async (playlistId: string, trackId: string): Promise<PlaylistTrack> => {
  const response = await client.post(`/playlists/${playlistId}/tracks`, { track_id: trackId });
  return response.data;
};

export const removeTrackFromPlaylist = async (playlistId: string, trackId: string): Promise<void> => {
  await client.delete(`/playlists/${playlistId}/tracks/${trackId}`);
};

export const reorderPlaylist = async (playlistId: string, trackId: string, newPosition: number): Promise<void> => {
  await client.put(`/playlists/${playlistId}/reorder`, { track_id: trackId, new_position: newPosition });
};

export const importPlaylistCsv = async (file: File): Promise<{ playlist_id: string; matched: number; unmatched: { row: number; reason: string }[] }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/playlists/import-export/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const importPlaylistJson = async (file: File): Promise<{ playlist_id: string; matched: number; unmatched: { row: number; reason: string }[] }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await client.post('/playlists/import-export/json', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const exportPlaylistCsv = async (playlistId: string): Promise<Blob> => {
  const response = await client.get(`/playlists/import-export/${playlistId}/export/csv`, {
    responseType: 'blob',
  });
  return response.data;
};

export const exportPlaylistJson = async (playlistId: string): Promise<Blob> => {
  const response = await client.get(`/playlists/import-export/${playlistId}/export/json`, {
    responseType: 'blob',
  });
  return response.data;
};

export interface SpotifyImportResult {
  playlist_id: string;
  title: string;
  matched: number;
  unmatched: number;
  unmatched_tracks: { title: string; artist: string; album: string }[];
  total_spotify_tracks: number;
}

export const importPlaylistFromSpotify = async (url: string): Promise<SpotifyImportResult> => {
  const response = await client.post('/playlists/import-export/spotify', { url });
  return response.data;
};

export interface DeezerImportResult {
  playlist_id: string;
  title: string;
  matched: number;
  unmatched: number;
  unmatched_tracks: { title: string; artist: string; album: string }[];
  total_deezer_tracks: number;
}

export const importPlaylistFromDeezer = async (url: string): Promise<DeezerImportResult> => {
  const response = await client.post('/playlists/import-export/deezer', { url });
  return response.data;
};
