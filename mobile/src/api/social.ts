import client from './client';

export const followUser = async (userId: string): Promise<void> => {
  await client.post(`/social/follow/${userId}`);
};

export const unfollowUser = async (userId: string): Promise<void> => {
  await client.delete(`/social/follow/${userId}`);
};

export const followArtist = async (artistId: string): Promise<void> => {
  await client.post(`/social/follow/artist/${artistId}`);
};

export const unfollowArtist = async (artistId: string): Promise<void> => {
  await client.delete(`/social/follow/artist/${artistId}`);
};

export const getFollowers = async () => {
  const response = await client.get('/social/followers');
  return response.data;
};

export const getFollowing = async () => {
  const response = await client.get('/social/following');
  return response.data;
};

export const getFeed = async (page = 1, pageSize = 20) => {
  const response = await client.get('/social/feed', { params: { page, page_size: pageSize } });
  return response.data;
};
