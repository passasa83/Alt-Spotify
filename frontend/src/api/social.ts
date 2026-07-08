import client from './client';
import type { User, ShareLink, PaginatedResponse } from '@/types';

export const followUser = async (userId: number): Promise<void> => {
  await client.post(`/social/follow/user/${userId}`);
};

export const unfollowUser = async (userId: number): Promise<void> => {
  await client.delete(`/social/follow/user/${userId}`);
};

export const followArtist = async (artistId: number): Promise<void> => {
  await client.post(`/social/follow/artist/${artistId}`);
};

export const unfollowArtist = async (artistId: number): Promise<void> => {
  await client.delete(`/social/follow/artist/${artistId}`);
};

export const getFollowers = async (): Promise<User[]> => {
  const response = await client.get('/social/followers');
  return response.data;
};

export const getFollowing = async (): Promise<User[]> => {
  const response = await client.get('/social/following');
  return response.data;
};

export const getFeed = async (): Promise<any[]> => {
  const response = await client.get('/social/feed');
  return response.data;
};

export const shareContent = async (type: string, id: number): Promise<ShareLink> => {
  const response = await client.post('/social/share', { type, id });
  return response.data;
};
