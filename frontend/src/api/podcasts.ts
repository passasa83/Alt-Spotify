import client from './client';
import type { Podcast, Episode, PaginatedResponse } from '@/types';

export const getPodcasts = async (page = 1, pageSize = 20, category?: string): Promise<PaginatedResponse<Podcast>> => {
  const params: Record<string, any> = { page, page_size: pageSize };
  if (category) params.category = category;
  const response = await client.get('/podcasts', { params });
  return response.data;
};

export const getPodcast = async (id: string): Promise<Podcast & { episodes: Episode[] }> => {
  const response = await client.get(`/podcasts/${id}`);
  return response.data;
};

export const getPodcastEpisodes = async (podcastId: string, page = 1, pageSize = 20): Promise<Episode[]> => {
  const response = await client.get(`/podcasts/${podcastId}/episodes`, {
    params: { page, page_size: pageSize },
  });
  return response.data;
};

export const playEpisode = async (episodeId: string): Promise<void> => {
  await client.post(`/podcasts/episodes/${episodeId}/play`);
};

export const getEpisodeStreamUrl = (podcastId: string, episodeId: string): string => {
  return `/api/v1/podcasts/${podcastId}/episodes/${episodeId}/stream`;
};

export const createPodcast = async (data: {
  title: string;
  description?: string;
  image_url?: string;
  author?: string;
  feed_url?: string;
  categories?: string[];
}): Promise<Podcast> => {
  const response = await client.post('/podcasts', data);
  return response.data;
};

export const importPodcastFeed = async (feedUrl: string): Promise<Podcast> => {
  const response = await client.post('/podcasts/feed/import', { feed_url: feedUrl });
  return response.data;
};
