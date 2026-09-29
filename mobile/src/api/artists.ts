import client from './client';
import type { Artist, Album, PaginatedResponse, Track } from '../types';

export const getArtists = async (page = 1, perPage = 20): Promise<PaginatedResponse<Artist>> => {
  const response = await client.get('/artists', { params: { page, page_size: perPage } });
  return response.data;
};

export const getArtist = async (id: string): Promise<Artist> => {
  const response = await client.get(`/artists/${id}`);
  return response.data;
};

export const getArtistAlbums = async (id: string, page = 1, perPage = 20): Promise<PaginatedResponse<Album>> => {
  const response = await client.get(`/artists/${id}/albums`, { params: { page, page_size: perPage } });
  return response.data;
};

export const getArtistTopTracks = async (id: string): Promise<Track[]> => {
  const response = await client.get('/tracks', {
    params: { artist_id: id, sort: 'play_count', order: 'desc', page_size: 10 },
  });
  return response.data.items;
};

export const searchArtists = async (query: string): Promise<Artist[]> => {
  const response = await client.get('/artists', { params: { q: query } });
  return response.data.items;
};
