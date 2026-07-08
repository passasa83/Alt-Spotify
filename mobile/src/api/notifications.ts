import client from './client';
import type { Notification, PaginatedResponse } from '../types';

export const getNotifications = async (page = 1): Promise<PaginatedResponse<Notification> & { unread_count: number }> => {
  const response = await client.get('/notifications', { params: { page } });
  return response.data;
};

export const getUnreadCount = async (): Promise<{ count: number }> => {
  const response = await client.get('/notifications/unread-count');
  return response.data;
};

export const markAsRead = async (id: string): Promise<void> => {
  await client.put(`/notifications/${id}/read`);
};

export const markAllAsRead = async (): Promise<void> => {
  await client.put('/notifications/read-all');
};
