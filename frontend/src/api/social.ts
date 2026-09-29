import client from './client';
import type { User, ShareLink, PaginatedResponse } from '@/types';

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
