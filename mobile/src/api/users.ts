import client from './client';
import type { User, UserStats } from '../types';

export const getMe = async (): Promise<User> => {
  const response = await client.get('/users/me');
  return response.data;
};

export const updateProfile = async (data: { pseudo?: string; avatar_url?: string; bio?: string; country?: string; is_child_account?: boolean }): Promise<User> => {
  const response = await client.put('/users/me', data);
  return response.data;
};

export const getUserStats = async (): Promise<UserStats> => {
  const response = await client.get('/users/me/stats');
  return response.data;
};
