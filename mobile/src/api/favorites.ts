import { client } from './client';
import type { PaginatedResponse } from './types';

export const addFavorite = async (entityType: string, entityId: string): Promise<void> => {
  await client.post('/favorites', null, { params: { entity_type: entityType, entity_id: entityId } });
};

export const removeFavorite = async (entityType: string, entityId: string): Promise<void> => {
  await client.delete('/favorites', { params: { entity_type: entityType, entity_id: entityId } });
};

export const checkFavorite = async (entityType: string, entityId: string): Promise<boolean> => {
  const response = await client.get('/favorites/check', { params: { entity_type: entityType, entity_id: entityId } });
  return response.data.is_favorited;
};

export const getFavorites = async (entityType: string, page = 1, pageSize = 50) => {
  const response = await client.get('/favorites', { params: { entity_type: entityType, page, page_size: pageSize } });
  return response.data;
};
