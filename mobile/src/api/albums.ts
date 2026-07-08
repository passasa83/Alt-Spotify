import client from './client';
import type { Album, Track, PaginatedResponse } from '../types';

export const getAlbums = async (page = 1, perPage = 20): Promise<PaginatedResponse<Album>> => {
  const response = await client.get('/albums', { params: { page, per_page: perPage } });
  return response.data;
};

export const getAlbum = async (id: string): Promise<Album> => {
  const response = await client.get(`/albums/${id}`);
  return response.data;
};

export const getAlbumTracks = async (id: string): Promise<Track[]> => {
  const response = await client.get(`/albums/${id}/tracks`);
  return response.data;
};

export const searchAlbums = async (query: string): Promise<Album[]> => {
  const response = await client.get('/albums/search', { params: { q: query } });
  return response.data;
};
