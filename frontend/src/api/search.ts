import client from './client';
import type { SearchResults, SearchFilters } from '@/types';

export const search = async (query: string, filters: SearchFilters = {}, source: 'local' | 'tidal' | 'all' = 'local'): Promise<SearchResults> => {
  const params: Record<string, string | number> = { q: query, source };
  if (filters.genre) params.genre = filters.genre;
  if (filters.year) params.year = filters.year;
  if (filters.min_duration) params.min_duration = filters.min_duration;
  if (filters.max_duration) params.max_duration = filters.max_duration;
  if (filters.min_bpm) params.min_bpm = filters.min_bpm;
  if (filters.max_bpm) params.max_bpm = filters.max_bpm;
  if (filters.key) params.key = filters.key;
  if (filters.mood) params.mood = filters.mood;
  if (filters.lyrics) params.lyrics = filters.lyrics;
  const response = await client.get('/search', { params });
  return response.data;
};
