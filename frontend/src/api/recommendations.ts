import client from './client';
import type { Track } from '@/types';

interface RecommendationList {
  title?: string;
  description?: string;
  tracks: Track[];
}

interface DailyMix {
  mix_id: string;
  title: string;
  description: string;
  genre: string | null;
  track_count: number;
  tracks: Track[];
}

export const getDiscoverWeekly = async (limit = 20): Promise<RecommendationList> => {
  const response = await client.get('/recommendations/discover', { params: { limit } });
  return response.data;
};

export const getDailyMixes = async (mixCount = 6): Promise<{ mixes: DailyMix[] }> => {
  const response = await client.get('/recommendations/daily-mix', { params: { mix_count: mixCount } });
  return response.data;
};

export const getRadio = async (trackId: string, limit = 20): Promise<RecommendationList> => {
  const response = await client.get(`/recommendations/radio/${trackId}`, { params: { limit } });
  return response.data;
};

export const getSimilarTracks = async (trackId: string, limit = 10): Promise<{ tracks: Track[] }> => {
  const response = await client.get(`/recommendations/similar/${trackId}`, { params: { limit } });
  return response.data;
};
