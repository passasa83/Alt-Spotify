import client from './client';
import type { TokenResponse, User } from '@/types';

export const login = async (email: string, password: string): Promise<TokenResponse> => {
  const response = await client.post('/auth/login', { email, password });
  return response.data;
};

export const register = async (email: string, pseudo: string, password: string, inviteToken?: string): Promise<User> => {
  const params: Record<string, string> = {};
  if (inviteToken) params.invite_token = inviteToken;
  const response = await client.post('/auth/register', { email, pseudo, password }, { params });
  return response.data;
};

export const refreshToken = async (refreshToken: string): Promise<TokenResponse> => {
  const response = await client.post('/auth/refresh', { refresh_token: refreshToken });
  return response.data;
};
