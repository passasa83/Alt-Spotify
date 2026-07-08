import client from './client';
import type { TokenResponse, User } from '../types';

export const login = async (email: string, password: string): Promise<TokenResponse> => {
  const formData = new URLSearchParams();
  formData.append('username', email);
  formData.append('password', password);
  const response = await client.post('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
};

export const register = async (email: string, pseudo: string, password: string): Promise<User> => {
  const response = await client.post('/auth/register', { email, pseudo, password });
  return response.data;
};

export const refreshToken = async (refreshToken: string): Promise<TokenResponse> => {
  const response = await client.post('/auth/refresh', { refresh_token: refreshToken });
  return response.data;
};

export const getMe = async (): Promise<User> => {
  const response = await client.get('/auth/me');
  return response.data;
};
