import client from './client';
import type { Playlist, PlaylistTrack, PaginatedResponse } from '../types';

export const getPlaylists = async (page = 1, perPage = 20): Promise<PaginatedResponse<Playlist>> => {
  const response = await client.get('/playlists', { params: { page, per_page: perPage } });
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

export const createPlaylist = async (data: { name: string; description?: string; is_public?: boolean }): Promise<Playlist> => {
  const response = await client.post('/playlists', data);
  return response.data;
};

export const updatePlaylist = async (id: string, data: { name?: string; description?: string; is_public?: boolean }): Promise<Playlist> => {
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
