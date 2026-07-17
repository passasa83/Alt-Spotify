import client from './client';

export const getPodcasts = async (page = 1, pageSize = 20) => {
  const response = await client.get('/podcasts', { params: { page, page_size: pageSize } });
  return response.data;
};

export const getPodcast = async (id: string) => {
  const response = await client.get(`/podcasts/${id}`);
  return response.data;
};

export const getPodcastEpisodes = async (podcastId: string, page = 1, pageSize = 50) => {
  const response = await client.get(`/podcasts/${podcastId}/episodes`, { params: { page, page_size: pageSize } });
  return response.data;
};

export const addPodcast = async (feedUrl: string) => {
  const response = await client.post('/podcasts', { feed_url: feedUrl });
  return response.data;
};

export const deletePodcast = async (id: string) => {
  await client.delete(`/podcasts/${id}`);
};
