import client from './client';
import type { Artist, Album, PaginatedResponse } from '@/types';

export const getArtists = async (page = 1, perPage = 20): Promise<PaginatedResponse<Artist>> => {
  const response = await client.get('/artists', { params: { page, per_page: perPage } });
  return response.data;
};

export const getArtist = async (id: string): Promise<Artist> => {
  const response = await client.get(`/artists/${id}`);
  return response.data;
};

export const getArtistAlbums = async (id: string, page = 1, perPage = 20): Promise<PaginatedResponse<Album>> => {
  const response = await client.get(`/artists/${id}/albums`, { params: { page, per_page: perPage } });
  return response.data;
};

export const searchArtists = async (query: string): Promise<Artist[]> => {
  const response = await client.get('/artists/search', { params: { q: query } });
  return response.data;
};
