import client from './client';
import type { Artist, Album, PaginatedResponse } from '@/types';

// `playable`: only artists with at least one track that has audio.
export const getArtists = async (
  page = 1,
  pageSize = 20,
  opts: { playable?: boolean; sort?: 'name' | 'popular' } = {},
): Promise<PaginatedResponse<Artist>> => {
  const response = await client.get('/artists', { params: { page, page_size: pageSize, playable: opts.playable, sort: opts.sort } });
  return response.data;
};

export const getArtist = async (id: string): Promise<Artist> => {
  const response = await client.get(`/artists/${id}`);
  return response.data;
};

// `playable`: hide albums none of whose tracks has audio.
// `sort`: "popular" ranks by the total plays of the album's tracks.
export const getArtistAlbums = async (
  id: string,
  page = 1,
  pageSize = 20,
  opts: { playable?: boolean; sort?: 'release_date' | 'popular' } = {},
): Promise<PaginatedResponse<Album>> => {
  const response = await client.get(`/artists/${id}/albums`, { params: { page, page_size: pageSize, playable: opts.playable, sort: opts.sort } });
  return response.data;
};

export const searchArtists = async (query: string): Promise<Artist[]> => {
  const response = await client.get('/artists', { params: { q: query } });
  return response.data.items;
};
